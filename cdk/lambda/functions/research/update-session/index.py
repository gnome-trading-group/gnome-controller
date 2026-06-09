"""Update metadata fields on a research session."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)

_ALLOWED_FIELDS = {
    "status",
    "best_iteration",
    "best_pnl",
    "best_sharpe",
    "spec_yaml",
    "description",
    "tags",
    "primary_metric",
    "primary_metric_direction",
    "thresholds",
    "targets",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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

    updates = {k: v for k, v in body.items() if k in _ALLOWED_FIELDS and v is not None}
    if not updates:
        return create_response(400, {"error": "no valid fields to update"})

    updates["updated_at"] = _now_iso()

    set_parts = [f"#{k} = :{k}" for k in updates]
    expr_attr_names = {f"#{k}": k for k in updates}
    expr_attr_values = {f":{k}": v for k, v in updates.items()}

    _table.update_item(
        Key={"session_name": session_name, "sk": "META"},
        UpdateExpression="SET " + ", ".join(set_parts),
        ExpressionAttributeNames=expr_attr_names,
        ExpressionAttributeValues=expr_attr_values,
        ConditionExpression="attribute_exists(sk)",
    )

    return create_response(200, {"session_name": session_name, **{k: v for k, v in updates.items() if k != "updated_at"}})
