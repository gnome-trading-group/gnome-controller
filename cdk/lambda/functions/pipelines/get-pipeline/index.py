"""Get a pipeline definition and its recent runs."""
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
    pipeline_name = (event.get("pathParameters") or {}).get("pipelineName", "")
    if not pipeline_name:
        return create_response(400, {"error": "pipelineName path parameter required"})

    definition_resp = _table.get_item(
        Key={"session_name": _PIPELINES_PK, "sk": f"PIPELINE#{pipeline_name}"}
    )
    definition = definition_resp.get("Item")
    if not definition:
        return create_response(404, {"error": f"Pipeline '{pipeline_name}' not found"})

    runs_resp = _table.query(
        KeyConditionExpression=Key("session_name").eq(_PIPELINES_PK) & Key("sk").begins_with(f"RUN#{pipeline_name}#"),
        ScanIndexForward=False,
        Limit=20,
    )
    runs = runs_resp.get("Items", [])

    return create_response(200, {
        "pipeline": _decimal_to_native(definition),
        "runs": _decimal_to_native(runs),
    })
