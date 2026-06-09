"""Get a research session with all iterations and notes."""
from __future__ import annotations

import json
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]

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
    try:
        session_name = event["pathParameters"]["sessionName"]
    except (KeyError, TypeError):
        body = json.loads(event.get("body") or "{}") if isinstance(event.get("body"), str) else event
        session_name = body.get("session_name")

    if not session_name:
        return create_response(400, {"error": "sessionName is required"})

    response = _table.query(
        KeyConditionExpression=Key("session_name").eq(session_name),
    )
    items = _decimal_to_native(response.get("Items", []))

    meta = next((i for i in items if i.get("sk") == "META"), None)
    if not meta:
        return create_response(404, {"error": f"session '{session_name}' not found"})

    iterations = sorted(
        [i for i in items if i.get("sk", "").startswith("ITER#")],
        key=lambda i: i.get("iteration", 0),
    )
    notes = sorted(
        [i for i in items if i.get("sk", "").startswith("NOTE#")],
        key=lambda i: i.get("timestamp", ""),
        reverse=True,
    )

    result = {**meta, "iterations": iterations, "notes": notes}
    return create_response(200, result)
