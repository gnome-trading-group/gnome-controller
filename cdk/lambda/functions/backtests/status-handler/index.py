"""EventBridge handler for AWS Batch job state changes."""
from __future__ import annotations

import json
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr, Key

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
S3_BUCKET = os.environ["S3_BUCKET"]

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)
_s3 = boto3.client("s3")

# Batch statuses that count as terminal
_TERMINAL = {"SUCCEEDED", "FAILED"}
# Batch → our status mapping
_STATUS_MAP = {
    "SUBMITTED": "SUBMITTED",
    "PENDING": "PENDING",
    "RUNNABLE": "PENDING",
    "STARTING": "RUNNING",
    "RUNNING": "RUNNING",
    "SUCCEEDED": "SUCCEEDED",
    "FAILED": "FAILED",
}


def _parse_run_id(job_name: str) -> str | None:
    """Extract run_id from Batch job name 'backtest-<run_id>'."""
    if job_name.startswith("backtest-"):
        return job_name[len("backtest-"):]
    return None


def _read_summary(run_id: str, array_index: int) -> dict:
    key = f"backtests/{run_id}/jobs/{array_index}/summary.json"
    try:
        obj = _s3.get_object(Bucket=S3_BUCKET, Key=key)
        return json.loads(obj["Body"].read())
    except Exception:
        return {}


def _update_job(run_id: str, array_index: int, batch_status: str, job_id: str) -> None:
    our_status = _STATUS_MAP.get(batch_status, batch_status)
    sk = f"JOB#{array_index:04d}"

    update_expr = "SET #st = :s, batch_child_job_id = :jid"
    names = {"#st": "status"}
    values: dict = {":s": our_status, ":jid": job_id}

    if batch_status == "SUCCEEDED":
        summary = _read_summary(run_id, array_index)
        if summary:
            update_expr += ", final_pnl = :pnl, sharpe = :sh"
            values[":pnl"] = Decimal(str(summary.get("final_pnl", 0)))
            values[":sh"] = Decimal(str(summary.get("sharpe", 0)))

    _table.update_item(
        Key={"run_id": run_id, "sk": sk},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )


def _try_finalize_run(run_id: str) -> None:
    """If all jobs are terminal, update META with final aggregate status."""
    response = _table.query(KeyConditionExpression=Key("run_id").eq(run_id))
    items = response.get("Items", [])

    meta = next((i for i in items if i.get("sk") == "META"), None)
    if not meta:
        return

    jobs = [i for i in items if i.get("sk", "").startswith("JOB#")]
    job_count = int(meta.get("job_count", len(jobs)))

    if len(jobs) < job_count:
        return

    statuses = {j.get("status") for j in jobs}
    if not statuses.issubset(_TERMINAL):
        return

    failed = sum(1 for j in jobs if j.get("status") == "FAILED")
    succeeded = sum(1 for j in jobs if j.get("status") == "SUCCEEDED")

    if failed == job_count:
        run_status = "FAILED"
    elif failed > 0:
        run_status = "PARTIALLY_FAILED"
    else:
        run_status = "COMPLETED"

    _table.update_item(
        Key={"run_id": run_id, "sk": "META"},
        UpdateExpression="SET #st = :s, completed_count = :cc, failed_count = :fc",
        ExpressionAttributeNames={"#st": "status"},
        ExpressionAttributeValues={":s": run_status, ":cc": succeeded, ":fc": failed},
    )


def handler(event: dict, context) -> None:
    detail = event.get("detail", {})
    batch_status = detail.get("status", "")
    job_name = detail.get("jobName", "")
    job_id = detail.get("jobId", "")

    # Array child jobs have jobName like "backtest-<run_id>:<array_index>"
    array_index = 0
    if ":" in job_name:
        job_name, idx_str = job_name.rsplit(":", 1)
        try:
            array_index = int(idx_str)
        except ValueError:
            pass

    run_id = _parse_run_id(job_name)
    if not run_id:
        return

    _update_job(run_id, array_index, batch_status, job_id)

    if batch_status in _TERMINAL:
        _try_finalize_run(run_id)
