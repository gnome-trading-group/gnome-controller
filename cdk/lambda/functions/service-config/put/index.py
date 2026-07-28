"""Update service config (Cognito-authenticated, UI only)."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from decimal import Decimal

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
        return claims.get("email") or claims.get("cognito:username", "unknown")
    except (KeyError, TypeError):
        return "unknown"


def handler(event: dict, context) -> dict:
    service = event["pathParameters"]["service"]

    try:
        body = json.loads(event.get("body") or "{}", parse_float=Decimal)
    except Exception:
        return create_response(400, {"error": "invalid JSON body"})

    if "config" not in body:
        return create_response(400, {"error": "config is required"})

    config = body["config"]
    if not isinstance(config, dict):
        return create_response(400, {"error": "config must be an object"})

    expected_version = body.get("version", 0)
    now = _now_iso()
    new_version = expected_version + 1

    try:
        _table.put_item(
            Item={
                "pk": f"SERVICE#{service}",
                "sk": "CURRENT",
                "config": config,
                "version": new_version,
                "updated_at": now,
                "updated_by": _caller(event),
            },
            ConditionExpression="attribute_not_exists(pk) OR #v = :expected",
            ExpressionAttributeNames={"#v": "version"},
            ExpressionAttributeValues={":expected": expected_version},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return create_response(409, {"error": "config was modified by another request, please reload and try again"})
        raise

    return create_response(200, {
        "config": config,
        "version": new_version,
        "updated_at": now,
        "updated_by": _caller(event),
    })
