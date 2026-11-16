"""Record Batch state changes of backtest jobs, keep the run's job counts current, and finalize a run once every job
has finished."""
from __future__ import annotations

import json
import math
import os
from decimal import Decimal

import boto3
from batch_runs import array_task, finish_task, set_run_status

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
        # DynamoDB stores no NaN or infinity, and a run of several listings has a NaN final_position: positions in
        # different instruments don't sum.
        if isinstance(v, float) and not math.isfinite(v):
            continue
        if isinstance(v, float):
            result[k] = Decimal(str(v))
        elif isinstance(v, int):
            result[k] = v
        else:
            result[k] = str(v)
    return result


def _finite(value) -> Decimal:
    return Decimal(str(value)) if isinstance(value, (int, float)) and math.isfinite(value) else Decimal(0)


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
        values[":pnl"] = _finite(summary.get("final_pnl"))
        values[":sh"] = _finite(summary.get("sharpe"))
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


def handler(event: dict, context) -> None:
    detail = event.get("detail") or {}
    job = array_task(detail, "backtest-")
    if job is None:
        return
    run_id, index = job
    _update_job(run_id, index, detail)
    status = STATUS.get(detail.get("status", ""))
    if status == "RUNNING":
        set_run_status(_table, run_id, "RUNNING", ("SUBMITTED", "PENDING"), "started_at")
    elif status in TERMINAL:
        finish_task(_table, run_id, index, status == "SUCCEEDED", ("completed_count", "failed_count"), "job_count",
                    UNFINISHED_RUN)
