"""List research sessions (META records only), most recently updated first."""
from __future__ import annotations

import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr, Key
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
DEFAULT_LIMIT = 20

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
    params = event.get("queryStringParameters") or {}
    status_filter = params.get("status")
    try:
        limit = int(params.get("limit", DEFAULT_LIMIT))
    except (ValueError, TypeError):
        limit = DEFAULT_LIMIT

    if status_filter:
        response = _table.query(
            IndexName="status-updated-index",
            KeyConditionExpression=Key("status").eq(status_filter),
            FilterExpression=Attr("sk").eq("META"),
            ScanIndexForward=False,
            Limit=limit * 3,  # overfetch since FilterExpression applies after Limit
        )
        items = _decimal_to_native(response.get("Items", []))[:limit]
    else:
        response = _table.scan(
            FilterExpression=Attr("sk").eq("META"),
        )
        items = _decimal_to_native(response.get("Items", []))
        items.sort(key=lambda i: i.get("updated_at", ""), reverse=True)
        items = items[:limit]

    for item in items:
        item.pop("spec_yaml", None)

    return create_response(200, {"sessions": items, "count": len(items)})
