"""Record Batch state changes of research job tasks, keep the run's task counts current, and finalize a run once
every task has finished."""
from __future__ import annotations

import os

import boto3
from batch_runs import STATUS_HANDLER_CONFIG, array_task, finish_task, set_run_status

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]

_ddb = boto3.resource("dynamodb", config=STATUS_HANDLER_CONFIG)
_table = _ddb.Table(DYNAMODB_TABLE)

TERMINAL = {"SUCCEEDED", "FAILED"}
STATUS = {
    "SUBMITTED": "SUBMITTED",
    "PENDING": "PENDING",
    "RUNNABLE": "PENDING",
    "STARTING": "RUNNING",
    "RUNNING": "RUNNING",
    "SUCCEEDED": "SUCCEEDED",
    "FAILED": "FAILED",
}


def _update_task(run_id: str, index: int, detail: dict) -> None:
    status = STATUS.get(detail.get("status", ""), detail.get("status", ""))
    expr = ["#st = :s", "batch_job_id = :j"]
    values: dict = {":s": status, ":j": detail.get("jobId", ""), ":succeeded": "SUCCEEDED", ":failed": "FAILED"}
    container = detail.get("container") or {}
    if stream := container.get("logStreamName"):
        expr.append("log_stream_name = :lsn")
        values[":lsn"] = stream
    if "exitCode" in container:
        expr.append("exit_code = :ec")
        values[":ec"] = container["exitCode"]
    if reason := detail.get("statusReason"):
        expr.append("status_reason = :r")
        values[":r"] = reason
    if started := detail.get("startedAt"):
        expr.append("started_at = :sa")
        values[":sa"] = started
    if stopped := detail.get("stoppedAt"):
        expr.append("stopped_at = :so")
        values[":so"] = stopped
    attempts = detail.get("attempts") or []
    expr.append("attempt_count = :ac")
    values[":ac"] = len(attempts)
    try:
        # Events can arrive out of order; a late RUNNING must not undo a finished task.
        _table.update_item(
            Key={"run_id": run_id, "sk": f"TASK#{index:04d}"},
            UpdateExpression="SET " + ", ".join(expr),
            ConditionExpression="attribute_exists(sk) AND NOT #st IN (:succeeded, :failed)",
            ExpressionAttributeNames={"#st": "status"},
            ExpressionAttributeValues=values,
        )
    except _table.meta.client.exceptions.ConditionalCheckFailedException:
        pass


def handler(event: dict, context) -> None:
    detail = event.get("detail") or {}
    task = array_task(detail, "research-")
    if task is None:
        return
    run_id, index = task
    _update_task(run_id, index, detail)
    status = STATUS.get(detail.get("status", ""))
    if status == "RUNNING":
        set_run_status(_table, run_id, "RUNNING", ("SUBMITTED",), "started_at")
    elif status in TERMINAL:
        finish_task(_table, run_id, index, status == "SUCCEEDED", ("succeeded_count", "failed_count"), "task_count",
                    ("SUBMITTED", "RUNNING"))
