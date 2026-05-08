"""Submit a backtest run (or parameter sweep) to AWS Batch."""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone

import boto3
import yaml
from utils import create_response

from sweep import expand_sweep, sweep_params

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
S3_BUCKET = os.environ["S3_BUCKET"]
BATCH_JOB_QUEUE = os.environ["BATCH_JOB_QUEUE"]
BATCH_JOB_DEFINITION = os.environ["BATCH_JOB_DEFINITION"]

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)
_s3 = boto3.client("s3")
_batch = boto3.client("batch")

TTL_DAYS = 90


def _run_id() -> str:
    """Generate a sortable run ID: timestamp-based hex string."""
    ts_ms = int(time.time() * 1000)
    return f"{ts_ms:016x}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ttl() -> int:
    return int(time.time()) + TTL_DAYS * 86400


def _s3_key(run_id: str, suffix: str) -> str:
    return f"backtests/{run_id}/{suffix}"


def _put_s3_yaml(run_id: str, suffix: str, data: dict) -> None:
    _s3.put_object(
        Bucket=S3_BUCKET,
        Key=_s3_key(run_id, suffix),
        Body=yaml.dump(data, default_flow_style=False).encode(),
        ContentType="application/x-yaml",
    )


def handler(event: dict, context) -> dict:
    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        body = event  # direct Lambda invoke (CLI)

    config_yaml = body.get("config")
    research_commit = body.get("research_commit", "main")
    submitted_by = _submitted_by(event)

    if not config_yaml:
        return create_response(400, {"error": "config is required"})

    try:
        config = yaml.safe_load(config_yaml)
    except yaml.YAMLError as e:
        return create_response(400, {"error": f"invalid YAML: {e}"})

    configs = expand_sweep(config)
    job_count = len(configs)
    run_id = _run_id()
    now = _now_iso()
    strategy = config.get("strategy", {}).get("class_name", "unknown")

    # Upload original config to S3
    _put_s3_yaml(run_id, "config.yaml", config)

    # Upload per-job configs to S3
    for i, cfg in enumerate(configs):
        _put_s3_yaml(run_id, f"jobs/{i}/config.yaml", cfg)

    # Write META record to DynamoDB
    _table.put_item(Item={
        "run_id": run_id,
        "sk": "META",
        "status": "SUBMITTED",
        "submitted_at": now,
        "submitted_by": submitted_by,
        "strategy": strategy,
        "job_count": job_count,
        "completed_count": 0,
        "failed_count": 0,
        "config_yaml": config_yaml,
        "sweep_params": {k: [str(v) for v in vals] for k, vals in sweep_params(config).items()},
        "research_commit": research_commit,
        "ttl": _ttl(),
    })

    # Submit individual Batch jobs and write JOB# records
    batch_job_ids = []
    for i, cfg in enumerate(configs):
        resp = _batch.submit_job(
            jobName=f"backtest-{run_id}-{i}",
            jobQueue=BATCH_JOB_QUEUE,
            jobDefinition=BATCH_JOB_DEFINITION,
            containerOverrides={
                "environment": [
                    {"name": "RUN_ID", "value": run_id},
                    {"name": "S3_BUCKET", "value": S3_BUCKET},
                    {"name": "RESEARCH_COMMIT", "value": research_commit},
                    {"name": "JOB_INDEX", "value": str(i)},
                ]
            },
            retryStrategy={"attempts": 2},
        )
        job_id = resp["jobId"]
        batch_job_ids.append(job_id)

        _table.put_item(Item={
            "run_id": run_id,
            "sk": f"JOB#{i:04d}",
            "status": "SUBMITTED",
            "submitted_at": now,
            "array_index": i,
            "batch_job_id": job_id,
            "config_params": {
                k: str(cfg.get("strategy", {}).get("args", {}).get(k, ""))
                for k in sweep_params(config)
            },
            "ttl": _ttl(),
        })

    return create_response(200, {
        "run_id": run_id,
        "job_count": job_count,
        "status": "SUBMITTED",
        "batch_job_id": batch_job_ids[0] if batch_job_ids else None,
    })


def _submitted_by(event: dict) -> str:
    """Extract user identity from Cognito claims or fallback."""
    try:
        claims = event["requestContext"]["authorizer"]["claims"]
        return claims.get("email") or claims.get("cognito:username", "cli")
    except (KeyError, TypeError):
        return "cli"
