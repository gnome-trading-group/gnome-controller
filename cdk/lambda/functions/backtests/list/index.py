"""List backtest runs (META records only), most recent first."""
from __future__ import annotations

import os
from decimal import Decimal

import boto3
from batch_runs import CONFIG_SK, recent_runs
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
RUN_STATUSES = ("SUBMITTED", "PENDING", "RUNNING", "COMPLETED", "PARTIALLY_FAILED", "FAILED", "CANCELLED")
DEFAULT_LIMIT = 20
BATCH_GET_MAX = 100

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


def _configs(run_ids: list[str]) -> dict[str, dict]:
    """The CONFIG row of each run that has one, by run_id."""
    found: dict[str, dict] = {}
    for start in range(0, len(run_ids), BATCH_GET_MAX):
        keys = [{"run_id": r, "sk": CONFIG_SK} for r in run_ids[start:start + BATCH_GET_MAX]]
        request = {DYNAMODB_TABLE: {"Keys": keys}}
        while request:
            response = _ddb.batch_get_item(RequestItems=request)
            for item in response.get("Responses", {}).get(DYNAMODB_TABLE, []):
                found[item["run_id"]] = item
            request = response.get("UnprocessedKeys") or None
    return found


def handler(event: dict, context) -> dict:
    params = event.get("queryStringParameters") or {}
    try:
        limit = max(1, int(params.get("limit", DEFAULT_LIMIT)))
    except (ValueError, TypeError):
        limit = DEFAULT_LIMIT

    statuses = [params["status"]] if params.get("status") else RUN_STATUSES
    runs = recent_runs(_table, statuses, limit)
    configs = _configs([r["run_id"] for r in runs])
    for run in runs:
        run.pop("config_yaml", None)
        if config := configs.get(run["run_id"]):
            run.update({k: v for k, v in config.items() if k not in ("run_id", "sk", "ttl")})
    runs = _native(runs)
    return create_response(200, {"runs": runs, "count": len(runs)})
