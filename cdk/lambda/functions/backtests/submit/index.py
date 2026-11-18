"""Submit a backtest run (or parameter sweep) to AWS Batch."""
from __future__ import annotations

import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import boto3
import yaml
from botocore.config import Config
from batch_runs import CONFIG_SK
from utils import create_response

from sweep import expand_scenarios_and_sweeps, get_param_value, scenario_names, sweep_params

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
S3_BUCKET = os.environ["S3_BUCKET"]
BATCH_JOB_QUEUE = os.environ["BATCH_JOB_QUEUE"]
BATCH_JOB_DEFINITION = os.environ["BATCH_JOB_DEFINITION"]
# The job definition's size, which a run keeps unless it asks for another.
DEFAULT_CPU = int(os.environ["DEFAULT_CPU"])
DEFAULT_MEMORY_GIB = int(os.environ["DEFAULT_MEMORY_GIB"])
UPLOAD_THREADS = 32

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)
_s3 = boto3.client("s3", config=Config(max_pool_connections=UPLOAD_THREADS))
_batch = boto3.client("batch")

TTL_DAYS = 90
# Batch's limit on an array job's size.
MAX_JOBS = 10_000
# A strategy commit is resolved to its SHA by the submitter, so every job of a run, and a rerun, compiles the same tree.
FULL_SHA = re.compile(r"^[0-9a-f]{40}$")
# gnome-backtest publishes only releases to GitHub Packages, where the job fetches an engine version from.
RELEASE_VERSION = re.compile(r"^\d+\.\d+\.\d+$")
# The largest job the compute environment's instance types hold (m5.2xlarge, less what ECS keeps): a bigger one would
# wait in RUNNABLE forever.
MAX_CPU = 8
MAX_MEMORY_GIB = 30


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


def _whole(value, name: str, most: int) -> int | None:
    """An optional whole number from 1 to ``most``."""
    if value is not None and (not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= most):
        raise ValueError(f"{name} must be a whole number from 1 to {most}")
    return value


def submit_job_kwargs(run_id: str, job_count: int, environment: list[dict], cpu: int | None = None,
                      memory_gib: int | None = None) -> dict:
    overrides: dict = {
        "environment": [{"name": "RUN_ID", "value": run_id}, {"name": "S3_BUCKET", "value": S3_BUCKET},
                        *environment],
    }
    resources = []
    if cpu is not None:
        resources.append({"type": "VCPU", "value": str(cpu)})
    if memory_gib is not None:
        resources.append({"type": "MEMORY", "value": str(memory_gib * 1024)})
    if resources:
        overrides["resourceRequirements"] = resources
    kwargs = {
        "jobName": f"backtest-{run_id}",
        "jobQueue": BATCH_JOB_QUEUE,
        "jobDefinition": BATCH_JOB_DEFINITION,
        "containerOverrides": overrides,
        "retryStrategy": {"attempts": 2},
    }
    # Batch array jobs need at least two children; a single job runs as a plain job (index 0).
    if job_count > 1:
        kwargs["arrayProperties"] = {"size": job_count}
    return kwargs


def _set_meta(run_id: str, fields: dict) -> None:
    _table.update_item(
        Key={"run_id": run_id, "sk": "META"},
        UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in fields),
        ExpressionAttributeNames={f"#{k}": k for k in fields},
        ExpressionAttributeValues={f":{k}": v for k, v in fields.items()},
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
    report = body.get("report", True)
    submitted_by = _submitted_by(event)

    if not config_yaml:
        return create_response(400, {"error": "config is required"})
    if strategy_commit is not None and not (isinstance(strategy_commit, str) and FULL_SHA.match(strategy_commit)):
        return create_response(400, {"error": "strategy_commit must be a full 40-character commit SHA"})
    if engine_version is not None and not (isinstance(engine_version, str) and RELEASE_VERSION.match(engine_version)):
        return create_response(400, {"error": "engine_version must be a gnome-backtest release (X.Y.Z)"})
    if not isinstance(report, bool):
        return create_response(400, {"error": "report must be true or false"})
    try:
        cpu = _whole(body.get("cpu"), "cpu", MAX_CPU)
        memory_gib = _whole(body.get("memory_gib"), "memory_gib", MAX_MEMORY_GIB)
    except ValueError as e:
        return create_response(400, {"error": str(e)})
    if not research_commit and not strategy_commit:
        research_commit = "main"

    try:
        config = yaml.safe_load(config_yaml)
    except yaml.YAMLError as e:
        return create_response(400, {"error": f"invalid YAML: {e}"})

    jobs = expand_scenarios_and_sweeps(config)
    job_count = len(jobs)
    if job_count > MAX_JOBS:
        return create_response(400, {"error": f"{job_count} jobs is more than a run can hold ({MAX_JOBS})"})
    run_id = _run_id()
    now = _now_iso()
    strategy = config.get("strategy", {}).get("class_name", "unknown")
    scenarios = scenario_names(config)
    params = sweep_params(config)

    _s3.put_object(Bucket=S3_BUCKET, Key=_s3_key(run_id, "config.yaml"), Body=config_yaml.encode(),
                   ContentType="application/x-yaml")
    with ThreadPoolExecutor(max_workers=UPLOAD_THREADS) as pool:
        list(pool.map(lambda i: _put_s3_yaml(run_id, f"jobs/{i}/config.yaml", jobs[i][1]), range(job_count)))

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
        "cpu": cpu or DEFAULT_CPU,
        "memory_gib": memory_gib or DEFAULT_MEMORY_GIB,
        "report": report,
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
    environment = [{"name": k.upper(), "value": v} for k, v in sources.items() if v]
    if not report:
        environment.append({"name": "NO_REPORT", "value": "1"})
    # Rows go in before the job exists: its first state changes arrive within seconds and update them. Job rows
    # carry no submitted_at, which keeps them out of the status index the list reads.
    _table.put_item(Item=meta_item)
    if scenarios:
        # DynamoDB bills a write by the whole row, and every finished job writes META, so what is never updated after
        # submit, like a long list of scenario names, lives in a row of its own.
        _table.put_item(Item={"run_id": run_id, "sk": CONFIG_SK, "scenarios": scenarios, "ttl": _ttl()})
    with _table.batch_writer() as writer:
        for i, (scenario_name, cfg) in enumerate(jobs):
            job_item: dict = {
                "run_id": run_id,
                "sk": f"JOB#{i:04d}",
                "status": "SUBMITTED",
                "array_index": i,
                "config_params": {k: get_param_value(cfg, k) for k in params},
                "ttl": _ttl(),
            }
            if scenario_name:
                job_item["scenario"] = scenario_name
            writer.put_item(Item=job_item)

    try:
        kwargs = submit_job_kwargs(run_id, job_count, environment, cpu, memory_gib)
        batch_job_id = _batch.submit_job(**kwargs)["jobId"]
    except Exception as e:
        _set_meta(run_id, {"status": "FAILED", "error": f"Batch submit failed: {e}"})
        raise
    _set_meta(run_id, {"batch_job_id": batch_job_id})

    return create_response(200, {
        "run_id": run_id,
        "job_count": job_count,
        "status": "SUBMITTED",
        "batch_job_id": batch_job_id,
    })


def _submitted_by(event: dict) -> str:
    """The caller the API authorizer resolved (a person's email), or a fallback."""
    try:
        return event["requestContext"]["authorizer"]["actor"]
    except (KeyError, TypeError):
        return "cli"
