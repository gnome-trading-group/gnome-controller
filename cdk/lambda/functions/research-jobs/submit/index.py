"""Submit a research job: one Batch array job running a gnomepy-research module, one task per argument list."""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone

import boto3
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
S3_BUCKET = os.environ["S3_BUCKET"]
BATCH_JOB_QUEUE = os.environ["BATCH_JOB_QUEUE"]
BATCH_JOB_DEFINITION = os.environ["BATCH_JOB_DEFINITION"]
# The job definition's resources, so a run records what its tasks actually got.
DEFAULT_CPU = int(os.environ["DEFAULT_CPU"])
DEFAULT_MEMORY_GIB = int(os.environ["DEFAULT_MEMORY_GIB"])

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)
_s3 = boto3.client("s3")
_batch = boto3.client("batch")

TTL_DAYS = 90
MAX_TASKS = 1000
MAX_CPU = 16
# Whole GiB below what the largest instance type in the compute environment can give one container.
MAX_MEMORY_GIB = 60
INPUTS_PREFIX = "research-jobs/inputs/"

_MODULE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$")
_INPUT_NAME = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_COMMIT = re.compile(r"^[0-9a-f]{40}$")


def run_id() -> str:
    return f"{int(time.time() * 1000):016x}"


def _str_list(value, what: str) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(a, str) for a in value):
        raise ValueError(f"{what} must be a list of strings")
    return value


def parse(body: dict) -> dict:
    """The validated request; raises ValueError naming the first thing wrong with it."""
    module = body.get("module")
    if not isinstance(module, str) or not _MODULE.match(module):
        raise ValueError("module must be a dotted Python module name")

    commit = body.get("research_commit")
    # A full SHA, so every task of the run (and a rerun) checks out the same code even if the branch moves.
    if not isinstance(commit, str) or not _COMMIT.match(commit):
        raise ValueError("research_commit must be a full 40-character commit SHA")

    array = body.get("array")
    args = body.get("args")
    if array is not None and args:
        raise ValueError("give args (one task) or array (one task per entry), not both")
    if array is not None:
        if not isinstance(array, list) or not array:
            raise ValueError("array must be a non-empty list of argument lists")
        if len(array) > MAX_TASKS:
            raise ValueError(f"array has {len(array)} tasks; at most {MAX_TASKS}")
        tasks = [_str_list(a, f"array[{i}]") for i, a in enumerate(array)]
    else:
        tasks = [_str_list(args or [], "args")]

    inputs = body.get("inputs") or {}
    if not isinstance(inputs, dict):
        raise ValueError("inputs must map a name to an uploaded input set")
    for name, digest in inputs.items():
        if not _INPUT_NAME.match(name):
            raise ValueError(f"input name {name!r} must be letters, digits, '_' or '-'")
        if not isinstance(digest, str) or not _SHA256.match(digest):
            raise ValueError(f"input {name!r} must be the sha256 of an uploaded input set")

    cpu = body.get("cpu")
    if cpu is not None and (not isinstance(cpu, int) or isinstance(cpu, bool) or not 1 <= cpu <= MAX_CPU):
        raise ValueError(f"cpu must be a whole number of vCPUs from 1 to {MAX_CPU}")
    memory_gib = body.get("memory_gib")
    if memory_gib is not None and (
            not isinstance(memory_gib, int) or isinstance(memory_gib, bool) or not 1 <= memory_gib <= MAX_MEMORY_GIB):
        raise ValueError(f"memory_gib must be a whole number of GiB from 1 to {MAX_MEMORY_GIB}")

    ref = body.get("research_ref")
    if ref is not None and not isinstance(ref, str):
        raise ValueError("research_ref must be a string")
    description = body.get("description")
    if description is not None and not isinstance(description, str):
        raise ValueError("description must be a string")

    return {
        "module": module,
        "research_commit": commit,
        "research_ref": ref,
        "tasks": tasks,
        "inputs": inputs,
        "cpu": cpu,
        "memory_gib": memory_gib,
        "description": description,
    }


def task_spec(request: dict, args: list[str]) -> dict:
    return {
        "module": request["module"],
        "args": args,
        "inputs": {name: f"s3://{S3_BUCKET}/{INPUTS_PREFIX}{digest}/" for name, digest in request["inputs"].items()},
    }


def submit_job_kwargs(rid: str, request: dict) -> dict:
    env = [
        {"name": "RUN_ID", "value": rid},
        {"name": "RESEARCH_COMMIT", "value": request["research_commit"]},
    ]
    resources = []
    if request["cpu"] is not None:
        resources.append({"type": "VCPU", "value": str(request["cpu"])})
    if request["memory_gib"] is not None:
        resources.append({"type": "MEMORY", "value": str(request["memory_gib"] * 1024)})
    overrides: dict = {"environment": env}
    if resources:
        overrides["resourceRequirements"] = resources
    kwargs = {
        "jobName": f"research-{rid}",
        "jobQueue": BATCH_JOB_QUEUE,
        "jobDefinition": BATCH_JOB_DEFINITION,
        "containerOverrides": overrides,
    }
    # Batch array jobs need at least two children; a single task runs as a plain job (index 0).
    if len(request["tasks"]) > 1:
        kwargs["arrayProperties"] = {"size": len(request["tasks"])}
    return kwargs


def _input_exists(digest: str) -> bool:
    try:
        _s3.head_object(Bucket=S3_BUCKET, Key=f"{INPUTS_PREFIX}{digest}/manifest.json")
        return True
    except _s3.exceptions.ClientError:
        return False


def _submitted_by(event: dict) -> str:
    try:
        return event["requestContext"]["authorizer"]["actor"]
    except (KeyError, TypeError):
        return "cli"


def _put_json(key: str, data: dict) -> None:
    _s3.put_object(Bucket=S3_BUCKET, Key=key, Body=json.dumps(data, indent=2).encode(),
                   ContentType="application/json")


def _set_meta(rid: str, fields: dict) -> None:
    _table.update_item(
        Key={"run_id": rid, "sk": "META"},
        UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in fields),
        ExpressionAttributeNames={f"#{k}": k for k in fields},
        ExpressionAttributeValues={f":{k}": v for k, v in fields.items()},
    )


def handler(event: dict, context) -> dict:
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return create_response(400, {"error": "body must be JSON"})
    try:
        request = parse(body)
    except ValueError as e:
        return create_response(400, {"error": str(e)})

    missing = [name for name, digest in request["inputs"].items() if not _input_exists(digest)]
    if missing:
        return create_response(400, {"error": f"inputs not uploaded (or upload unfinished): {', '.join(missing)}"})

    rid = run_id()
    now = datetime.now(timezone.utc).isoformat()
    ttl = int(time.time()) + TTL_DAYS * 86400
    prefix = f"research-jobs/runs/{rid}"
    submitted_by = _submitted_by(event)

    _put_json(f"{prefix}/request.json", {**body, "submitted_by": submitted_by, "submitted_at": now})
    for i, args in enumerate(request["tasks"]):
        _put_json(f"{prefix}/jobs/{i}/task.json", task_spec(request, args))

    meta = {
        "run_id": rid,
        "sk": "META",
        "status": "SUBMITTED",
        "submitted_at": now,
        "submitted_by": submitted_by,
        "module": request["module"],
        "research_commit": request["research_commit"],
        "task_count": len(request["tasks"]),
        "succeeded_count": 0,
        "failed_count": 0,
        "inputs": request["inputs"],
        "output_prefix": f"s3://{S3_BUCKET}/{prefix}/",
        "cpu": request["cpu"] or DEFAULT_CPU,
        "memory_gib": request["memory_gib"] or DEFAULT_MEMORY_GIB,
        "ttl": ttl,
    }
    for key in ("research_ref", "description"):
        if request[key] is not None:
            meta[key] = request[key]
    # Rows go in before the job exists: its first state changes arrive within seconds and update them.
    _table.put_item(Item=meta)
    with _table.batch_writer() as writer:
        for i, args in enumerate(request["tasks"]):
            writer.put_item(Item={
                "run_id": rid,
                "sk": f"TASK#{i:04d}",
                "status": "SUBMITTED",
                "array_index": i,
                "args": args,
                "ttl": ttl,
            })

    try:
        batch_job_id = _batch.submit_job(**submit_job_kwargs(rid, request))["jobId"]
    except Exception as e:
        _set_meta(rid, {"status": "FAILED", "error": f"Batch submit failed: {e}"})
        raise
    _set_meta(rid, {"batch_job_id": batch_job_id})

    return create_response(200, {
        "run_id": rid,
        "task_count": len(request["tasks"]),
        "status": "SUBMITTED",
        "batch_job_id": batch_job_id,
        "output_prefix": meta["output_prefix"],
    })
