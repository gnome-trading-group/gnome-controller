"""Get a research job with its task statuses, log links and output locations."""
from __future__ import annotations

import os
from decimal import Decimal
from urllib.parse import quote

import boto3
from boto3.dynamodb.conditions import Key
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
S3_BUCKET = os.environ["S3_BUCKET"]
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
_LOG_GROUP = "/aws/batch/job"

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)


def _native(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    if isinstance(obj, dict):
        return {k: _native(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_native(v) for v in obj]
    return obj


def cloudwatch_log_url(log_stream_name: str) -> str:
    # The console's fragment encodes '/' as $252F (a URL-encoded '%2F').
    group = _LOG_GROUP.replace("/", "$252F")
    stream = log_stream_name.replace("/", "$252F")
    base = f"https://{AWS_REGION}.console.aws.amazon.com/cloudwatch/home?region={AWS_REGION}"
    return f"{base}#logsV2:log-groups/log-group/{group}/log-events/{stream}"


def s3_console_url(prefix: str) -> str:
    return (f"https://{AWS_REGION}.console.aws.amazon.com/s3/buckets/{S3_BUCKET}"
            f"?region={AWS_REGION}&prefix={quote(prefix)}")


def items(run_id: str) -> list[dict]:
    kwargs = {"KeyConditionExpression": Key("run_id").eq(run_id)}
    out = []
    while True:
        response = _table.query(**kwargs)
        out += response.get("Items", [])
        if "LastEvaluatedKey" not in response:
            return out
        kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]


def describe(run_id: str, rows: list[dict]) -> dict | None:
    rows = _native(rows)
    meta = next((r for r in rows if r.get("sk") == "META"), None)
    if not meta:
        return None
    tasks = sorted((r for r in rows if r.get("sk", "").startswith("TASK#")), key=lambda r: r["array_index"])
    for task in tasks:
        prefix = f"research-jobs/runs/{run_id}/jobs/{task['array_index']}/"
        task["output_prefix"] = f"s3://{S3_BUCKET}/{prefix}out/"
        task["log_s3_uri"] = f"s3://{S3_BUCKET}/{prefix}log.txt"
        task["s3_console_url"] = s3_console_url(prefix)
        if stream := task.get("log_stream_name"):
            task["log_url"] = cloudwatch_log_url(stream)
    meta["s3_console_url"] = s3_console_url(f"research-jobs/runs/{run_id}/")
    return {**meta, "tasks": tasks}


def handler(event: dict, context) -> dict:
    run_id = (event.get("pathParameters") or {}).get("runId")
    if not run_id:
        return create_response(400, {"error": "runId is required"})
    result = describe(run_id, items(run_id))
    if result is None:
        return create_response(404, {"error": "run not found"})
    return create_response(200, result)
