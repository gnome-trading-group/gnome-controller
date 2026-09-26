"""List artifact metadata records from DynamoDB."""
from __future__ import annotations

import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr, Key
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
    params = event.get("queryStringParameters") or {}
    artifact_type = params.get("type")
    name = params.get("name")
    session_name = params.get("session_name")

    items: list[dict] = []

    if artifact_type and name:
        resp = _table.query(
            IndexName="artifact-type-name-index",
            KeyConditionExpression=Key("artifact_type").eq(artifact_type) & Key("artifact_name").eq(name),
        )
        items = resp.get("Items", [])
    elif session_name:
        sk_prefix = "ARTIFACT#"
        if artifact_type:
            sk_prefix += f"{artifact_type}#"
        resp = _table.query(
            KeyConditionExpression=Key("session_name").eq(session_name) & Key("sk").begins_with(sk_prefix),
        )
        items = resp.get("Items", [])
    else:
        filter_expr = Attr("sk").begins_with("ARTIFACT#")
        if artifact_type:
            filter_expr = filter_expr & Attr("artifact_type").eq(artifact_type)
        resp = _table.scan(FilterExpression=filter_expr)
        items = resp.get("Items", [])

    items = _decimal_to_native(items)
    items.sort(key=lambda i: (i.get("artifact_type", ""), i.get("artifact_name", ""), -i.get("version", 0)))

    return create_response(200, {"artifacts": items, "count": len(items)})
