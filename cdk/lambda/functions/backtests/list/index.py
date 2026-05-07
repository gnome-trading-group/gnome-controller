"""List backtest runs (META records only), most recent first."""
from __future__ import annotations

import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
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

    # Scan for all META records; DynamoDB doesn't support filtering by SK prefix
    # in a scan efficiently, so we filter client-side on the small META set.
    # The GSI on status lets us filter by status without a full scan.
    if status_filter:
        response = _table.query(
            IndexName="status-submitted-index",
            KeyConditionExpression=Key("status").eq(status_filter),
            ScanIndexForward=False,
            Limit=limit,
            FilterExpression="sk = :meta",
            ExpressionAttributeValues={":meta": "META"},
        )
        items = _decimal_to_native(response.get("Items", []))
    else:
        # Scan for META records; table is small (90-day TTL), this is fine.
        response = _table.scan(
            FilterExpression="sk = :meta",
            ExpressionAttributeValues={":meta": "META"},
        )
        items = _decimal_to_native(response.get("Items", []))
        # Sort by submitted_at descending and apply limit
        items.sort(key=lambda i: i.get("submitted_at", ""), reverse=True)
        items = items[:limit]

    # Strip large fields from list view
    for item in items:
        item.pop("config_yaml", None)

    return create_response(200, {"runs": items, "count": len(items)})
