"""Record a research iteration result."""
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

    iteration = body.get("iteration")
    if iteration is None:
        return create_response(400, {"error": "iteration is required"})

    now = body.get("timestamp") or _now_iso()

    item = {
        "session_name": session_name,
        "sk": f"ITER#{int(iteration):03d}",
        "iteration": int(iteration),
        "timestamp": now,
        "type": body.get("type", "local"),
        "owner": _caller(event),
        "title": body.get("title", ""),
        "description": body.get("description", ""),
        "metrics": body.get("metrics", {}),
        "metadata": body.get("metadata", {}),
        "environment": body.get("environment", {}),
    }

    try:
        _table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(sk)",
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return create_response(409, {"error": f"iteration {iteration} already exists"})
        raise

    _table.update_item(
        Key={"session_name": session_name, "sk": "META"},
        UpdateExpression="ADD iteration_count :one SET updated_at = :now",
        ExpressionAttributeValues={":one": 1, ":now": now},
    )

    return create_response(200, {"session_name": session_name, "iteration": int(iteration)})
