"""Get backtest run details and job statuses."""
from __future__ import annotations

import json
import os
from decimal import Decimal

import boto3
from batch_runs import FINISHED_INDEXES
from boto3.dynamodb.conditions import Key
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
S3_BUCKET = os.environ["S3_BUCKET"]
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
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


def _cloudwatch_log_url(log_stream_name: str) -> str:
    encoded_group = _LOG_GROUP.replace("/", "$252F")
    encoded_stream = log_stream_name.replace("/", "$252F")
    base = f"https://{AWS_REGION}.console.aws.amazon.com/cloudwatch/home?region={AWS_REGION}"
    return f"{base}#logsV2:log-groups/log-group/{encoded_group}/log-events/{encoded_stream}"


def _report_url(run_id: str, array_index: int) -> str:
    # Presigning is local, with no request to S3, so a run of a thousand jobs costs nothing here.
    return _s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_BUCKET, "Key": f"backtests/{run_id}/jobs/{array_index}/report.html"},
        ExpiresIn=3600,
    )


def _query_run(run_id: str) -> list[dict]:
    kwargs = {"KeyConditionExpression": Key("run_id").eq(run_id)}
    rows = []
    while True:
        response = _table.query(**kwargs)
        rows += response.get("Items", [])
        if "LastEvaluatedKey" not in response:
            return rows
        kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]


def handler(event: dict, context) -> dict:
    # Support both API Gateway path params and direct invoke
    try:
        run_id = event["pathParameters"]["runId"]
    except (KeyError, TypeError):
        run_id = (event.get("body") and json.loads(event["body"]) or event).get("run_id")

    if not run_id:
        return create_response(400, {"error": "run_id is required"})

    items = _decimal_to_native(_query_run(run_id))

    meta = next((i for i in items if i.get("sk") == "META"), None)
    if not meta:
        return create_response(404, {"error": "run not found"})

    jobs = sorted(
        [i for i in items if i.get("sk", "").startswith("JOB#")],
        key=lambda i: i.get("array_index", 0),
    )

    meta.pop(FINISHED_INDEXES, None)
    for job in jobs:
        # A job writes its summary alongside its report, and the status handler stores the summary only when found.
        if job.get("status") == "SUCCEEDED" and job.get("summary"):
            job["report_url"] = _report_url(run_id, job.get("array_index", 0))
        if log_stream_name := job.get("log_stream_name"):
            job["log_url"] = _cloudwatch_log_url(log_stream_name)

    result = {**meta, "jobs": jobs}

    return create_response(200, result)
