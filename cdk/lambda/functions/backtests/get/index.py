"""Get backtest run details and job statuses."""
from __future__ import annotations

import json
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
S3_BUCKET = os.environ["S3_BUCKET"]
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
_JOB_DEF_NAME = "gnome-backtest"
_LOG_GROUP = "/aws/batch/job"

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)
_s3 = boto3.client("s3")


def _decimal_to_native(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    if isinstance(obj, dict):
        return {k: _decimal_to_native(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_decimal_to_native(v) for v in obj]
    return obj


def _cloudwatch_log_url(child_job_id: str) -> str:
    log_stream = f"{_JOB_DEF_NAME}/default/{child_job_id}"
    encoded_group = _LOG_GROUP.replace("/", "$252F")
    encoded_stream = log_stream.replace("/", "$2F")
    base = f"https://{AWS_REGION}.console.aws.amazon.com/cloudwatch/home?region={AWS_REGION}"
    return f"{base}#logsV2:log-groups/log-group/{encoded_group}/log-events/{encoded_stream}"


def _presigned_report_url(run_id: str, array_index: int) -> str | None:
    key = f"backtests/{run_id}/jobs/{array_index}/report.html"
    try:
        _s3.head_object(Bucket=S3_BUCKET, Key=key)
        return _s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": S3_BUCKET, "Key": key},
            ExpiresIn=3600,
        )
    except Exception:
        return None


def handler(event: dict, context) -> dict:
    # Support both API Gateway path params and direct invoke
    try:
        run_id = event["pathParameters"]["runId"]
    except (KeyError, TypeError):
        run_id = (event.get("body") and json.loads(event["body"]) or event).get("run_id")

    if not run_id:
        return create_response(400, {"error": "run_id is required"})

    response = _table.query(
        KeyConditionExpression=Key("run_id").eq(run_id),
    )
    items = _decimal_to_native(response.get("Items", []))

    meta = next((i for i in items if i.get("sk") == "META"), None)
    if not meta:
        return create_response(404, {"error": "run not found"})

    jobs = sorted(
        [i for i in items if i.get("sk", "").startswith("JOB#")],
        key=lambda i: i.get("array_index", 0),
    )

    # Add presigned report URLs and CloudWatch log links for each job
    for job in jobs:
        idx = job.get("array_index", 0)
        if job.get("status") == "SUCCEEDED":
            job["report_url"] = _presigned_report_url(run_id, idx)
        if child_job_id := job.get("batch_child_job_id"):
            job["log_url"] = _cloudwatch_log_url(child_job_id)

    result = {**meta, "jobs": jobs}
    result.pop("config_yaml", None)  # exclude large field from list view

    return create_response(200, result)
