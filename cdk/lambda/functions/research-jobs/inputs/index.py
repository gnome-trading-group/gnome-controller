"""Presign uploads of a research job input set, stored once under research-jobs/inputs/<sha256>/.

The client names the set by the sha256 of its manifest (each file's path, size and sha256). A set whose
manifest.json already exists is complete and is not uploaded again. Otherwise the client PUTs every file and
then manifest.json, which marks the set complete.
"""
from __future__ import annotations

import hashlib
import json
import os
import posixpath
import re

import boto3
from utils import create_response

S3_BUCKET = os.environ["S3_BUCKET"]
INPUTS_PREFIX = "research-jobs/inputs/"
URL_EXPIRY_SECONDS = 3600
MAX_FILES = 500

_s3 = boto3.client("s3")

_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_PATH_PART = re.compile(r"^[A-Za-z0-9._-]+$")


def manifest_digest(files: list[dict]) -> str:
    """Must match gnomepy.remote's digest of the same manifest."""
    canonical = json.dumps(sorted(files, key=lambda f: f["path"]), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def parse(body: dict) -> list[dict]:
    files = body.get("files")
    if not isinstance(files, list) or not files:
        raise ValueError("files must be a non-empty list of {path, size, sha256}")
    if len(files) > MAX_FILES:
        raise ValueError(f"at most {MAX_FILES} files per input set")
    seen = set()
    parsed = []
    for f in files:
        if not isinstance(f, dict):
            raise ValueError("each file must be {path, size, sha256}")
        path, size, digest = f.get("path"), f.get("size"), f.get("sha256")
        if (not isinstance(path, str) or posixpath.normpath(path) != path
                or not all(part not in ("", ".", "..") and _PATH_PART.match(part) for part in path.split("/"))):
            raise ValueError(f"file path {path!r} must be relative, normalised, and letters, digits, '.', '_' or '-'")
        if path == "manifest.json":
            raise ValueError("manifest.json is reserved")
        if path in seen:
            raise ValueError(f"file path {path!r} appears twice")
        seen.add(path)
        if not isinstance(size, int) or isinstance(size, bool) or size < 0:
            raise ValueError(f"file {path!r} size must be a non-negative integer")
        if not isinstance(digest, str) or not _SHA256.match(digest):
            raise ValueError(f"file {path!r} sha256 must be 64 lowercase hex characters")
        parsed.append({"path": path, "size": size, "sha256": digest})
    return parsed


def _exists(key: str) -> bool:
    try:
        _s3.head_object(Bucket=S3_BUCKET, Key=key)
        return True
    except _s3.exceptions.ClientError:
        return False


def _put_url(key: str) -> str:
    return _s3.generate_presigned_url("put_object", Params={"Bucket": S3_BUCKET, "Key": key},
                                      ExpiresIn=URL_EXPIRY_SECONDS)


def handler(event: dict, context) -> dict:
    try:
        body = json.loads(event.get("body") or "{}")
        files = parse(body)
    except json.JSONDecodeError:
        return create_response(400, {"error": "body must be JSON"})
    except ValueError as e:
        return create_response(400, {"error": str(e)})

    digest = manifest_digest(files)
    prefix = f"{INPUTS_PREFIX}{digest}/"
    result = {"sha256": digest, "uri": f"s3://{S3_BUCKET}/{prefix}"}
    if _exists(f"{prefix}manifest.json"):
        return create_response(200, {**result, "exists": True})

    return create_response(200, {
        **result,
        "exists": False,
        "uploads": {f["path"]: _put_url(prefix + f["path"]) for f in files},
        "manifest_upload": _put_url(f"{prefix}manifest.json"),
    })
