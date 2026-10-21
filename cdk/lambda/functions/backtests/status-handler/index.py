"""Record Batch state changes of backtest jobs, keep the run's job counts current, and finalize a run once every job
has finished."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
S3_BUCKET = os.environ["S3_BUCKET"]

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)
_s3 = boto3.client("s3")

TERMINAL = {"SUCCEEDED", "FAILED"}
UNFINISHED_RUN = ("SUBMITTED", "PENDING", "RUNNING")
STATUS = {
    "SUBMITTED": "SUBMITTED",
    "PENDING": "PENDING",
    "RUNNABLE": "PENDING",
    "STARTING": "RUNNING",
    "RUNNING": "RUNNING",
    "SUCCEEDED": "SUCCEEDED",
    "FAILED": "FAILED",
}


def job_event(detail: dict) -> tuple[str, int] | None:
    """(run_id, job index) of a backtest job's event, named backtest-<run_id>-<index>; None for other jobs."""
    name = detail.get("jobName", "")
    if not name.startswith("backtest-"):
        return None
    run_id, _, index = name[len("backtest-"):].rpartition("-")
    if not run_id or not index.isdigit():
        return None
    return run_id, int(index)


def run_status(job_statuses: list[str], job_count: int) -> str | None:
    """The run's final status, or None while any job is unfinished."""
    if len(job_statuses) < job_count or not set(job_statuses) <= TERMINAL:
        return None
    failed = job_statuses.count("FAILED")
    if failed == 0:
        return "COMPLETED"
    return "FAILED" if failed == job_count else "PARTIALLY_FAILED"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_summary(run_id: str, index: int) -> dict:
    try:
        obj = _s3.get_object(Bucket=S3_BUCKET, Key=f"backtests/{run_id}/jobs/{index}/summary.json")
        return json.loads(obj["Body"].read())
    except Exception:
        return {}


def _serialize_summary(raw: dict) -> dict:
    result = {}
    for k, v in raw.items():
        if isinstance(v, (dict, list)) or v is None:
            continue
        if isinstance(v, float):
            result[k] = Decimal(str(v))
        elif isinstance(v, int):
            result[k] = v
        else:
            result[k] = str(v)
    return result


def _update_job(run_id: str, index: int, detail: dict) -> None:
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
    expr.append("attempt_count = :ac")
    values[":ac"] = len(detail.get("attempts") or [])
    if status == "SUCCEEDED" and (summary := _read_summary(run_id, index)):
        expr += ["summary = :sum", "final_pnl = :pnl", "sharpe = :sh"]
        values[":sum"] = _serialize_summary(summary)
        values[":pnl"] = Decimal(str(summary.get("final_pnl", 0)))
        values[":sh"] = Decimal(str(summary.get("sharpe", 0)))
        if summary.get("warnings"):
            expr.append("warnings = :w")
            values[":w"] = summary["warnings"]
    try:
        # Events can arrive out of order; a late RUNNING must not undo a finished job.
        _table.update_item(
            Key={"run_id": run_id, "sk": f"JOB#{index:04d}"},
            UpdateExpression="SET " + ", ".join(expr),
            ConditionExpression="attribute_exists(sk) AND NOT #st IN (:succeeded, :failed)",
            ExpressionAttributeNames={"#st": "status"},
            ExpressionAttributeValues=values,
        )
    except _table.meta.client.exceptions.ConditionalCheckFailedException:
        pass


def _set_run_status(run_id: str, status: str, allowed_from: tuple[str, ...], stamp: str) -> None:
    values: dict = {":s": status, ":t": _now(), **{f":from{i}": s for i, s in enumerate(allowed_from)}}
    try:
        _table.update_item(
            Key={"run_id": run_id, "sk": "META"},
            UpdateExpression=f"SET #st = :s, {stamp} = :t",
            ConditionExpression=f"#st IN ({', '.join(f':from{i}' for i in range(len(allowed_from)))})",
            ExpressionAttributeNames={"#st": "status"},
            ExpressionAttributeValues=values,
        )
    except _table.meta.client.exceptions.ConditionalCheckFailedException:
        pass


def _on_job_finished(run_id: str) -> None:
    """Recount the run's finished jobs, so a run in progress shows them, and finalize it once all have."""
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
    statuses = [r["status"] for r in rows if r["sk"].startswith("JOB#")]
    _table.update_item(
        Key={"run_id": run_id, "sk": "META"},
        UpdateExpression="SET completed_count = :cc, failed_count = :fc",
        ExpressionAttributeValues={":cc": statuses.count("SUCCEEDED"), ":fc": statuses.count("FAILED")},
    )
    final = run_status(statuses, int(meta["job_count"]))
    if final:
        # A cancelled run stays CANCELLED as its terminated jobs fail.
        _set_run_status(run_id, final, UNFINISHED_RUN, "finished_at")


def handler(event: dict, context) -> None:
    detail = event.get("detail") or {}
    job = job_event(detail)
    if job is None:
        return
    run_id, index = job
    _update_job(run_id, index, detail)
    status = STATUS.get(detail.get("status", ""))
    if status == "RUNNING":
        _set_run_status(run_id, "RUNNING", ("SUBMITTED", "PENDING"), "started_at")
    elif status in TERMINAL:
        _on_job_finished(run_id)
