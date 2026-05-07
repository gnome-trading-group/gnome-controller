"""Cancel a backtest run: terminate Batch jobs and update DynamoDB."""
from __future__ import annotations

import os

import boto3
from boto3.dynamodb.conditions import Key
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
BATCH_JOB_QUEUE = os.environ["BATCH_JOB_QUEUE"]

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)
_batch = boto3.client("batch")

_CANCELLABLE = {"SUBMITTED", "PENDING", "RUNNING"}


def handler(event: dict, context) -> dict:
    try:
        run_id = event["pathParameters"]["runId"]
    except (KeyError, TypeError):
        run_id = (event.get("body") and __import__("json").loads(event["body"]) or event).get("run_id")

    if not run_id:
        return create_response(400, {"error": "run_id is required"})

    response = _table.query(KeyConditionExpression=Key("run_id").eq(run_id))
    items = response.get("Items", [])

    meta = next((i for i in items if i.get("sk") == "META"), None)
    if not meta:
        return create_response(404, {"error": "run not found"})

    if meta.get("status") not in _CANCELLABLE:
        return create_response(409, {"error": f"run is {meta.get('status')}, cannot cancel"})

    batch_job_id = meta.get("batch_job_id")
    if batch_job_id:
        try:
            _batch.terminate_job(jobId=batch_job_id, reason="Cancelled by user")
        except _batch.exceptions.ClientError:
            pass

    _table.update_item(
        Key={"run_id": run_id, "sk": "META"},
        UpdateExpression="SET #st = :s",
        ExpressionAttributeNames={"#st": "status"},
        ExpressionAttributeValues={":s": "CANCELLED"},
    )

    return create_response(200, {"run_id": run_id, "status": "CANCELLED"})
