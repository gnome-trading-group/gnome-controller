"""Record Batch state changes of research job tasks, and finalize a run once every task has finished."""
from __future__ import annotations

import os

import boto3
from boto3.dynamodb.conditions import Key

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]

_ddb = boto3.resource("dynamodb")
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


def task_event(detail: dict) -> tuple[str, int] | None:
    """(run_id, array index) of a task's event; None for the array parent and for other jobs."""
    name = detail.get("jobName", "")
    if not name.startswith("research-"):
        return None
    array = detail.get("arrayProperties") or {}
    if "index" in array:
        return name[len("research-"):], int(array["index"])
    # The parent of an array job reports a size; its children report their own states.
    if "size" in array:
        return None
    return name[len("research-"):], 0


def run_status(task_statuses: list[str], task_count: int) -> str | None:
    """The run's final status, or None while any task is unfinished."""
    if len(task_statuses) < task_count or not set(task_statuses) <= TERMINAL:
        return None
    failed = task_statuses.count("FAILED")
    if failed == 0:
        return "COMPLETED"
    return "FAILED" if failed == task_count else "PARTIALLY_FAILED"


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


def _set_run_status(run_id: str, status: str, allowed_from: tuple[str, ...], counts: dict | None = None) -> None:
    expr = "SET #st = :s"
    values: dict = {":s": status, **{f":from{i}": s for i, s in enumerate(allowed_from)}}
    if counts:
        expr += ", succeeded_count = :sc, failed_count = :fc"
        values[":sc"] = counts["succeeded"]
        values[":fc"] = counts["failed"]
    try:
        _table.update_item(
            Key={"run_id": run_id, "sk": "META"},
            UpdateExpression=expr,
            ConditionExpression=f"#st IN ({', '.join(f':from{i}' for i in range(len(allowed_from)))})",
            ExpressionAttributeNames={"#st": "status"},
            ExpressionAttributeValues=values,
        )
    except _table.meta.client.exceptions.ConditionalCheckFailedException:
        pass


def _finalize(run_id: str) -> None:
    kwargs = {"KeyConditionExpression": Key("run_id").eq(run_id), "ConsistentRead": True}
    rows = []
    while True:
        response = _table.query(**kwargs)
        rows += response.get("Items", [])
        if "LastEvaluatedKey" not in response:
            break
        kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
    meta = next((r for r in rows if r["sk"] == "META"), None)
    if meta is None:
        return
    statuses = [r["status"] for r in rows if r["sk"].startswith("TASK#")]
    final = run_status(statuses, int(meta["task_count"]))
    if final:
        _set_run_status(run_id, final, ("SUBMITTED", "RUNNING"),
                        {"succeeded": statuses.count("SUCCEEDED"), "failed": statuses.count("FAILED")})


def handler(event: dict, context) -> None:
    detail = event.get("detail") or {}
    task = task_event(detail)
    if task is None:
        return
    run_id, index = task
    _update_task(run_id, index, detail)
    status = STATUS.get(detail.get("status", ""))
    if status == "RUNNING":
        _set_run_status(run_id, "RUNNING", ("SUBMITTED",))
    elif status in TERMINAL:
        _finalize(run_id)
