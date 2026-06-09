"""Add a research note to a session."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import boto3
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
        session_name = event["pathParameters"]["sessionName"]
    except (KeyError, TypeError):
        body = json.loads(event.get("body") or "{}") if isinstance(event.get("body"), str) else event
        session_name = body.get("session_name")

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        body = event

    if not session_name:
        return create_response(400, {"error": "sessionName is required"})

    content = (body.get("content") or "").strip()
    if not content:
        return create_response(400, {"error": "content is required"})

    now = _now_iso()
    _table.put_item(Item={
        "session_name": session_name,
        "sk": f"NOTE#{now}",
        "timestamp": now,
        "author": _caller(event),
        "content": content,
    })

    _table.update_item(
        Key={"session_name": session_name, "sk": "META"},
        UpdateExpression="SET updated_at = :now",
        ExpressionAttributeValues={":now": now},
    )

    return create_response(200, {"session_name": session_name, "timestamp": now})
