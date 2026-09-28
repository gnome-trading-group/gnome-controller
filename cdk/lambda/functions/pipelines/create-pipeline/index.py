"""Create or upsert a pipeline definition in DynamoDB."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import boto3
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
_PIPELINES_PK = "__pipelines__"

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def handler(event: dict, context) -> dict:
    body = json.loads(event.get("body") or "{}")
    pipeline_name = body.get("pipeline_name", "").strip()
    if not pipeline_name:
        return create_response(400, {"error": "pipeline_name is required"})

    now = _now()
    item = {
        "session_name": _PIPELINES_PK,
        "sk": f"PIPELINE#{pipeline_name}",
        "pipeline_name": pipeline_name,
        "description": body.get("description", ""),
        "schedule": body.get("schedule"),
        "schedule_enabled": body.get("schedule_enabled", False),
        "parameters": body.get("parameters", {}),
        "cpu": body.get("cpu", 1024),
        "memory": body.get("memory", 4096),
        "created_at": now,
        "updated_at": now,
    }
    _table.put_item(Item=item, ConditionExpression="attribute_not_exists(sk)")
    return create_response(201, {"pipeline": item})
