"""List pipeline definitions from DynamoDB."""
from __future__ import annotations

import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
_PIPELINES_PK = "__pipelines__"

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)


def _decimal_to_native(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    if isinstance(obj, dict):
        return {k: _decimal_to_native(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_decimal_to_native(v) for v in obj]
    return obj


def handler(event: dict, context) -> dict:
    resp = _table.query(
        KeyConditionExpression=Key("session_name").eq(_PIPELINES_PK) & Key("sk").begins_with("PIPELINE#"),
    )
    items = _decimal_to_native(resp.get("Items", []))
    items.sort(key=lambda i: i.get("pipeline_name", ""))
    return create_response(200, {"pipelines": items, "count": len(items)})
