"""Update pipeline run status when an ECS Fargate task stops.

Triggered by EventBridge rule on ECS task state changes. Only needed as a
safety net — the runner.py always updates DynamoDB before exiting. This
catches OOM kills and container crashes that bypass the runner.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Attr, Key

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
_PIPELINES_PK = "__pipelines__"

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def handler(event: dict, context) -> dict:
    detail = event.get("detail", {})
    task_arn = detail.get("taskArn", "")
    last_status = detail.get("lastStatus", "")

    if last_status != "STOPPED":
        return {}

    containers = detail.get("containers", [{}])
    exit_code = containers[0].get("exitCode") if containers else None

    if exit_code == 0:
        return {}

    resp = _table.query(
        KeyConditionExpression=Key("session_name").eq(_PIPELINES_PK) & Key("sk").begins_with("RUN#"),
        FilterExpression=Attr("ecs_task_arn").eq(task_arn),
    )
    items = resp.get("Items", [])
    for item in items:
        if item.get("status") == "RUNNING":
            _table.update_item(
                Key={"session_name": _PIPELINES_PK, "sk": item["sk"]},
                UpdateExpression="SET #s = :s, completed_at = :ts, error_message = :err",
                ConditionExpression="#s = :running",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":s": "FAILED",
                    ":ts": _now(),
                    ":err": f"ECS task stopped with exit code {exit_code}",
                    ":running": "RUNNING",
                },
            )
    return {}
