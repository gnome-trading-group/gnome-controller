"""Create a new research session."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _caller(event: dict) -> str:
    try:
        claims = event["requestContext"]["authorizer"]["claims"]
        return claims.get("email") or claims.get("cognito:username", "cli")
    except (KeyError, TypeError):
        return "cli"


def handler(event: dict, context) -> dict:
    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        body = event

    session_name = (body.get("session_name") or "").strip()
    if not session_name:
        return create_response(400, {"error": "session_name is required"})

    now = _now_iso()
    item = {
        "session_name": session_name,
        "sk": "META",
        "status": "running",
        "created_at": now,
        "updated_at": now,
        "owner": _caller(event),
        "description": body.get("description", ""),
        "tags": body.get("tags", []),
        "spec_yaml": body.get("spec_yaml", ""),
        "branch": body.get("branch", f"research/{session_name}"),
        "iteration_count": 0,
    }

    try:
        _table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(sk)",
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return create_response(409, {"error": f"session '{session_name}' already exists"})
        raise

    return create_response(200, {
        "session_name": session_name,
        "status": "running",
        "created_at": now,
    })
