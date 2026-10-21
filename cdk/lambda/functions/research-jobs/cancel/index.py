"""Cancel a research job: terminate its Batch job (every array child with it) and mark the run CANCELLED."""
from __future__ import annotations

import os

import boto3
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)
_batch = boto3.client("batch")

CANCELLABLE = {"SUBMITTED", "RUNNING"}


def handler(event: dict, context) -> dict:
    run_id = (event.get("pathParameters") or {}).get("runId")
    if not run_id:
        return create_response(400, {"error": "runId is required"})

    meta = _table.get_item(Key={"run_id": run_id, "sk": "META"}).get("Item")
    if not meta:
        return create_response(404, {"error": "run not found"})
    if meta.get("status") not in CANCELLABLE:
        return create_response(409, {"error": f"run is {meta.get('status')}, cannot cancel"})

    # Marked first, so the failures termination causes never finalize the run as FAILED.
    _table.update_item(
        Key={"run_id": run_id, "sk": "META"},
        UpdateExpression="SET #st = :s",
        ExpressionAttributeNames={"#st": "status"},
        ExpressionAttributeValues={":s": "CANCELLED"},
    )
    if job_id := meta.get("batch_job_id"):
        _batch.terminate_job(jobId=job_id, reason="Cancelled by user")
    return create_response(200, {"run_id": run_id, "status": "CANCELLED"})
