"""Register artifact metadata in DynamoDB after client-side S3 upload."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)


def handler(event: dict, context) -> dict:
    try:
        body = json.loads(event.get("body") or "{}", parse_float=Decimal)
    except json.JSONDecodeError:
        return create_response(400, {"error": "invalid JSON body"})

    required = ["artifact_type", "name", "version", "s3_uri", "file_format", "size_bytes"]
    for field in required:
        if field not in body:
            return create_response(400, {"error": f"missing required field: {field}"})

    claims = (event.get("requestContext") or {}).get("authorizer", {}).get("claims", {})
    created_by = claims.get("email") or claims.get("cognito:username", "cli")

    artifact_type = body["artifact_type"]
    name = body["name"]
    version = int(body["version"])
    session_name = body.get("session_name", "__global__")

    item: dict = {
        "session_name": session_name,
        "sk": f"ARTIFACT#{artifact_type}#{name}#{version}",
        "artifact_type": artifact_type,
        "artifact_name": name,
        "version": version,
        "s3_uri": body["s3_uri"],
        "file_format": body["file_format"],
        "size_bytes": int(body["size_bytes"]),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": created_by,
        "description": body.get("description", ""),
    }
    if "params" in body:
        item["params"] = body["params"]
    if "source_iteration" in body:
        item["source_iteration"] = int(body["source_iteration"])
    if "git_commit" in body:
        item["git_commit"] = body["git_commit"]

    try:
        _table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(sk)",
        )
    except _ddb.meta.client.exceptions.ConditionalCheckFailedException:
        return create_response(409, {"error": f"artifact {artifact_type}/{name}:{version} already registered"})

    return create_response(201, {"artifact_type": artifact_type, "name": name, "version": version})
