"""Submit a backtest run (or parameter sweep) to AWS Batch."""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone

import boto3
import yaml
from utils import create_response

from sweep import expand_scenarios_and_sweeps, get_param_value, scenario_names, sweep_params

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
S3_BUCKET = os.environ["S3_BUCKET"]
BATCH_JOB_QUEUE = os.environ["BATCH_JOB_QUEUE"]
BATCH_JOB_DEFINITION = os.environ["BATCH_JOB_DEFINITION"]

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)
_s3 = boto3.client("s3")
_batch = boto3.client("batch")

TTL_DAYS = 90
# A strategy commit is resolved to its SHA by the submitter, so every job of a run, and a rerun, compiles the same tree.
FULL_SHA = re.compile(r"^[0-9a-f]{40}$")
# gnome-backtest publishes only releases to GitHub Packages, where the job fetches an engine version from.
RELEASE_VERSION = re.compile(r"^\d+\.\d+\.\d+$")


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
    research_commit = body.get("research_commit")
    strategy_commit = body.get("strategy_commit")
    engine_version = body.get("engine_version")
    submitted_by = _submitted_by(event)

    if not config_yaml:
        return create_response(400, {"error": "config is required"})
    if strategy_commit is not None and not (isinstance(strategy_commit, str) and FULL_SHA.match(strategy_commit)):
        return create_response(400, {"error": "strategy_commit must be a full 40-character commit SHA"})
    if engine_version is not None and not (isinstance(engine_version, str) and RELEASE_VERSION.match(engine_version)):
        return create_response(400, {"error": "engine_version must be a gnome-backtest release (X.Y.Z)"})
    if not research_commit and not strategy_commit:
        research_commit = "main"

    try:
        config = yaml.safe_load(config_yaml)
    except yaml.YAMLError as e:
        return create_response(400, {"error": f"invalid YAML: {e}"})

    jobs = expand_scenarios_and_sweeps(config)
    job_count = len(jobs)
    run_id = _run_id()
    now = _now_iso()
    strategy = config.get("strategy", {}).get("class_name", "unknown")
    scenarios = scenario_names(config)
    params = sweep_params(config)

    # Upload original config to S3
    _put_s3_yaml(run_id, "config.yaml", config)

    # Upload per-job configs to S3
    for i, (_, cfg) in enumerate(jobs):
        _put_s3_yaml(run_id, f"jobs/{i}/config.yaml", cfg)

    # Write META record to DynamoDB
    meta_item: dict = {
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
        "sweep_params": {
            k: [json.dumps(v, sort_keys=True) if isinstance(v, dict) else str(v) for v in vals]
            for k, vals in params.items()
        },
        "ttl": _ttl(),
    }
    sources = {
        "research_commit": research_commit,
        "strategy_commit": strategy_commit,
        "engine_version": engine_version,
    }
    meta_item.update({k: v for k, v in sources.items() if v})
    if scenarios:
        meta_item["scenarios"] = scenarios
    environment = [{"name": k.upper(), "value": v} for k, v in sources.items() if v]
    _table.put_item(Item=meta_item)

    # Submit individual Batch jobs and write JOB# records
    batch_job_ids = []
    for i, (scenario_name, cfg) in enumerate(jobs):
        resp = _batch.submit_job(
            jobName=f"backtest-{run_id}-{i}",
            jobQueue=BATCH_JOB_QUEUE,
            jobDefinition=BATCH_JOB_DEFINITION,
            containerOverrides={
                "environment": [
                    {"name": "RUN_ID", "value": run_id},
                    {"name": "S3_BUCKET", "value": S3_BUCKET},
                    *environment,
                    {"name": "JOB_INDEX", "value": str(i)},
                ]
            },
            retryStrategy={"attempts": 2},
        )
        job_id = resp["jobId"]
        batch_job_ids.append(job_id)

        job_item: dict = {
            "run_id": run_id,
            "sk": f"JOB#{i:04d}",
            "status": "SUBMITTED",
            "submitted_at": now,
            "array_index": i,
            "batch_job_id": job_id,
            "config_params": {k: get_param_value(cfg, k) for k in params},
            "ttl": _ttl(),
        }
        if scenario_name:
            job_item["scenario"] = scenario_name
        _table.put_item(Item=job_item)

    return create_response(200, {
        "run_id": run_id,
        "job_count": job_count,
        "status": "SUBMITTED",
        "batch_job_id": batch_job_ids[0] if batch_job_ids else None,
    })


def _submitted_by(event: dict) -> str:
    """The caller the API authorizer resolved (a person's email), or a fallback."""
    try:
        return event["requestContext"]["authorizer"]["actor"]
    except (KeyError, TypeError):
        return "cli"
