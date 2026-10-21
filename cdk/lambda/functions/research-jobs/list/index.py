"""List research jobs (META rows), most recent first."""
from __future__ import annotations

import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr, Key
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
DEFAULT_LIMIT = 50

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)


def _native(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    if isinstance(obj, dict):
        return {k: _native(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_native(v) for v in obj]
    return obj


def _paginate(call, **kwargs) -> list[dict]:
    out = []
    while True:
        response = call(**kwargs)
        out += response.get("Items", [])
        if "LastEvaluatedKey" not in response:
            return out
        kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]


def handler(event: dict, context) -> dict:
    params = event.get("queryStringParameters") or {}
    try:
        limit = max(1, int(params.get("limit", DEFAULT_LIMIT)))
    except (TypeError, ValueError):
        limit = DEFAULT_LIMIT

    # Only META rows carry submitted_at, so the status index holds runs and never tasks.
    if status := params.get("status"):
        rows = _paginate(_table.query, IndexName="status-submitted-index",
                         KeyConditionExpression=Key("status").eq(status), ScanIndexForward=False)
    else:
        # A scan is fine: rows expire after 90 days.
        rows = _paginate(_table.scan, FilterExpression=Attr("sk").eq("META"))

    runs = sorted(_native(rows), key=lambda r: r.get("submitted_at", ""), reverse=True)[:limit]
    return create_response(200, {"runs": runs, "count": len(runs)})
