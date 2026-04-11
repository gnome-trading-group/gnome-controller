"""Submit a backtest job to AWS Batch."""
import json
import os
import secrets
import time
from typing import Any

import boto3

from utils import create_response

BACKTESTS_TABLE = os.environ["BACKTESTS_TABLE"]
PRESETS_TABLE = os.environ["PRESETS_TABLE"]
JOB_QUEUE = os.environ["JOB_QUEUE"]
JOB_DEFINITION = os.environ["JOB_DEFINITION"]
RESULTS_BUCKET = os.environ["RESULTS_BUCKET"]
GH_TOKEN_SECRET_ARN = os.environ["GH_TOKEN_SECRET_ARN"]

dynamodb = boto3.resource("dynamodb")
backtests_table = dynamodb.Table(BACKTESTS_TABLE)
presets_table = dynamodb.Table(PRESETS_TABLE)
batch_client = boto3.client("batch")
s3_client = boto3.client("s3")
secrets_client = boto3.client("secretsmanager")


def _uuid7() -> str:
    ms = int(time.time() * 1000) & 0xFFFFFFFFFFFF
    ra = secrets.randbits(12)
    rb = secrets.randbits(62)
    n = (ms << 80) | (0x7 << 76) | (ra << 64) | (0b10 << 62) | rb
    h = f"{n:032x}"
    return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, TypeError):
        return create_response(400, {"error": "Invalid JSON body"})

    preset_id = body.get("presetId")
    config_yaml = body.get("config")
    research_commit = body.get("researchCommit", "main")

    # Resolve config: inline config takes priority, else load from preset.
    preset_name = ""
    if config_yaml:
        # Inline config provided (possibly edited from a preset).
        if preset_id:
            preset = presets_table.get_item(Key={"presetId": preset_id}).get("Item")
            preset_name = preset.get("name", "") if preset else ""
    elif preset_id:
        preset = presets_table.get_item(Key={"presetId": preset_id}).get("Item")
        if not preset:
            return create_response(404, {"error": f"Preset {preset_id} not found"})
        config_yaml = preset["config"]
        preset_name = preset.get("name", "")
    else:
        return create_response(400, {"error": "Either presetId or config is required"})

    # Generate job ID and upload config to S3.
    job_id = _uuid7()
    config_key = f"backtests/{job_id}/config.yaml"
    s3_client.put_object(
        Bucket=RESULTS_BUCKET,
        Key=config_key,
        Body=config_yaml.encode("utf-8"),
    )

    # Resolve GH_TOKEN from Secrets Manager.
    gh_token = secrets_client.get_secret_value(
        SecretId=GH_TOKEN_SECRET_ARN,
    )["SecretString"]

    # Extract submitter from Cognito claims.
    claims = (event.get("requestContext", {})
              .get("authorizer", {})
              .get("claims", {}))
    submitted_by = claims.get("email") or claims.get("cognito:username", "unknown")

    # Submit Batch job.
    config_s3_uri = f"s3://{RESULTS_BUCKET}/{config_key}"
    output_s3_uri = f"s3://{RESULTS_BUCKET}/backtests/{job_id}/"

    response = batch_client.submit_job(
        jobName=f"backtest-{job_id[:8]}",
        jobQueue=JOB_QUEUE,
        jobDefinition=JOB_DEFINITION,
        containerOverrides={
            "environment": [
                {"name": "RESEARCH_COMMIT", "value": research_commit},
                {"name": "GH_TOKEN", "value": gh_token},
                {"name": "BACKTEST_CONFIG", "value": config_s3_uri},
                {"name": "JOB_ID", "value": job_id},
            ],
            "command": [
                "--output", output_s3_uri,
                "--job-id", job_id,
            ],
        },
    )

    # Write job record to DynamoDB.
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    backtests_table.put_item(Item={
        "jobId": job_id,
        "batchJobId": response["jobId"],
        "status": "SUBMITTED",
        "presetId": preset_id,
        "presetName": preset_name,
        "researchCommit": research_commit,
        "submittedBy": submitted_by,
        "submittedAt": now,
    })

    return create_response(200, {"jobId": job_id})
