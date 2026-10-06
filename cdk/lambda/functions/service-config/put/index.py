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
# The resource's client converts plain Python values to DynamoDB's typed form itself, so items and expression values
# must be passed as plain values; pre-serializing them gets them wrapped twice and DynamoDB rejects the write.
_client = _ddb.meta.client


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _caller(event: dict) -> str:
    try:
        claims = event["requestContext"]["authorizer"]["claims"]
        return claims.get("email") or claims.get("cognito:username", "unknown")
    except (KeyError, TypeError):
        return "unknown"


def _is_conflict(e: ClientError) -> bool:
    code = e.response["Error"]["Code"]
    if code == "ConditionalCheckFailedException":
        return True
    if code != "TransactionCanceledException":
        return False
    reasons = e.response.get("CancellationReasons") or []
    return any(r.get("Code") == "ConditionalCheckFailed" for r in reasons)


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

    pk = f"SERVICE#{service}"
    updated_by = _caller(event)
    audit = {
        "config": config,
        "version": new_version,
        "updated_at": now,
        "updated_by": updated_by,
    }

    try:
        _client.transact_write_items(TransactItems=[
            {
                "Put": {
                    "TableName": DYNAMODB_TABLE,
                    "Item": {"pk": pk, "sk": "CURRENT", **audit},
                    "ConditionExpression": "attribute_not_exists(pk) OR #v = :expected",
                    "ExpressionAttributeNames": {"#v": "version"},
                    "ExpressionAttributeValues": {":expected": expected_version},
                },
            },
            {
                "Put": {
                    "TableName": DYNAMODB_TABLE,
                    "Item": {"pk": pk, "sk": f"VERSION#{new_version:010d}", **audit},
                    "ConditionExpression": "attribute_not_exists(pk)",
                },
            },
        ])
    except ClientError as e:
        if _is_conflict(e):
            return create_response(409, {"error": "config was modified by another request, please reload and try again"})
        # Returned rather than raised so the controller shows the reason instead of a bare 502.
        return create_response(500, {"error": f"Failed to save config: {e.response['Error'].get('Message', str(e))}"})

    return create_response(200, audit)
