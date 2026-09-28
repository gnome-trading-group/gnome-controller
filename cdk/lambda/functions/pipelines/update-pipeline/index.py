"""Update pipeline definition and manage EventBridge Scheduler schedule."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
TRIGGER_LAMBDA_ARN = os.environ["TRIGGER_LAMBDA_ARN"]
SCHEDULER_ROLE_ARN = os.environ["SCHEDULER_ROLE_ARN"]
_PIPELINES_PK = "__pipelines__"

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)
_scheduler = boto3.client("scheduler")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sync_schedule(pipeline_name: str, schedule: str | None, enabled: bool) -> None:
    schedule_name = f"pipeline-{pipeline_name}"

    if not enabled or not schedule:
        try:
            _scheduler.delete_schedule(Name=schedule_name)
        except ClientError as e:
            if e.response["Error"]["Code"] != "ResourceNotFoundException":
                raise
        return

    kwargs = dict(
        Name=schedule_name,
        GroupName="default",
        ScheduleExpression=schedule,
        ScheduleExpressionTimezone="UTC",
        FlexibleTimeWindow={"Mode": "OFF"},
        State="ENABLED",
        ActionAfterCompletion="NONE",
        Target={
            "Arn": TRIGGER_LAMBDA_ARN,
            "RoleArn": SCHEDULER_ROLE_ARN,
            "Input": json.dumps({"pipeline_name": pipeline_name, "trigger": "scheduled"}),
        },
    )
    try:
        _scheduler.update_schedule(**kwargs)
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            raise
        _scheduler.create_schedule(**kwargs)


def handler(event: dict, context) -> dict:
    pipeline_name = (event.get("pathParameters") or {}).get("pipelineName", "")
    if not pipeline_name:
        return create_response(400, {"error": "pipelineName path parameter required"})

    body = json.loads(event.get("body") or "{}")

    existing_resp = _table.get_item(
        Key={"session_name": _PIPELINES_PK, "sk": f"PIPELINE#{pipeline_name}"}
    )
    if not existing_resp.get("Item"):
        return create_response(404, {"error": f"Pipeline '{pipeline_name}' not found"})

    updates: dict = {"updated_at": _now()}
    for field in ("description", "schedule", "schedule_enabled", "parameters", "cpu", "memory"):
        if field in body:
            updates[field] = body[field]

    update_expr = "SET " + ", ".join(f"#{k} = :{k}" for k in updates)
    _table.update_item(
        Key={"session_name": _PIPELINES_PK, "sk": f"PIPELINE#{pipeline_name}"},
        UpdateExpression=update_expr,
        ExpressionAttributeNames={f"#{k}": k for k in updates},
        ExpressionAttributeValues={f":{k}": v for k, v in updates.items()},
    )

    item = _table.get_item(
        Key={"session_name": _PIPELINES_PK, "sk": f"PIPELINE#{pipeline_name}"}
    )["Item"]

    _sync_schedule(pipeline_name, item.get("schedule"), bool(item.get("schedule_enabled", False)))

    return create_response(200, {"pipeline": item})
