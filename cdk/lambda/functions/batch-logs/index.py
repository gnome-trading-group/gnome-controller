"""Read one Batch task's CloudWatch log lines, newest page first. Deployed once per run table: research jobs keep
tasks under TASK#, backtests under JOB#."""
from __future__ import annotations

import os

import boto3
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
TASK_SK_PREFIX = os.environ["TASK_SK_PREFIX"]
LOG_GROUP = "/aws/batch/job"
MAX_LINES = 500

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)
_logs = boto3.client("logs")


def handler(event: dict, context) -> dict:
    path = event.get("pathParameters") or {}
    params = event.get("queryStringParameters") or {}
    try:
        index = int(path["index"])
        limit = min(MAX_LINES, max(1, int(params.get("limit", MAX_LINES))))
    except (KeyError, TypeError, ValueError):
        return create_response(400, {"error": "index and limit must be integers"})
    run_id = path.get("runId")
    if not run_id:
        return create_response(400, {"error": "runId is required"})

    task = _table.get_item(Key={"run_id": run_id, "sk": f"{TASK_SK_PREFIX}{index:04d}"}).get("Item")
    if task is None:
        return create_response(404, {"error": f"run {run_id} has no task {index}"})
    if not task.get("log_stream_name"):
        return create_response(200, {"lines": [], "before": None})

    request = {"logGroupName": LOG_GROUP, "logStreamName": task["log_stream_name"], "limit": limit,
               "startFromHead": False}
    if before := params.get("before"):
        request["nextToken"] = before
    try:
        page = _logs.get_log_events(**request)
    except _logs.exceptions.ResourceNotFoundException:
        # Batch names the stream before the container has written to it.
        return create_response(200, {"lines": [], "before": None})
    lines = [{"at": e["timestamp"], "message": e["message"]} for e in page["events"]]
    return create_response(200, {"lines": lines, "before": page["nextBackwardToken"] if lines else None})
