"""Update pipeline run status when an ECS Fargate task stops, and report a failed run as an alert.

Triggered by EventBridge rule on ECS task state changes. The runner records a failure itself before exiting; this
marks the ones it couldn't (OOM kills, container crashes). Either way a failed run is put on the alert bus: a scheduled
run's output can feed trading (a launcher rule reads cs2_prematch_predict), so it's an ERROR; a manual one is only
for the record, since whoever started it sees it fail.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Attr, Key

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
# The registry's alerting stack names its bus; any service in the account may put alerts on it.
ALERT_BUS_NAME = os.environ.get("ALERT_BUS_NAME", "gnome-alerts")
_PIPELINES_PK = "__pipelines__"

logger = logging.getLogger(__name__)
_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)
_events = boto3.client("events")


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
            error = f"ECS task stopped with exit code {exit_code}"
            _table.update_item(
                Key={"session_name": _PIPELINES_PK, "sk": item["sk"]},
                UpdateExpression="SET #s = :s, completed_at = :ts, error_message = :err",
                ConditionExpression="#s = :running",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":s": "FAILED",
                    ":ts": _now(),
                    ":err": error,
                    ":running": "RUNNING",
                },
            )
            _report_failure(item, error)
        elif item.get("status") == "FAILED":
            _report_failure(item, item.get("error_message") or f"ECS task stopped with exit code {exit_code}")
    return {}


def _report_failure(item: dict, error: str) -> None:
    pipeline = item.get("pipeline_name", "")
    run_id = item.get("run_id", "")
    alert = {
        "action": "FIRING",
        "key": f"PIPELINE_FAILED:{pipeline}:{run_id}",
        "type": "PIPELINE_FAILED",
        "source": "ingest",
        "title": f"Pipeline {pipeline} failed",
        "body": error,
        "labels": {"pipeline": pipeline, "runId": run_id, "trigger": item.get("trigger", "manual")},
        "stateAt": _now(),
    }
    # Alerting must never fail the status update.
    try:
        _events.put_events(Entries=[{
            "EventBusName": ALERT_BUS_NAME, "Source": "gnome.alerts", "DetailType": "Alert", "Detail": json.dumps(alert),
        }])
    except Exception:
        logger.warning("Couldn't report pipeline %s run %s failing", pipeline, run_id, exc_info=True)
