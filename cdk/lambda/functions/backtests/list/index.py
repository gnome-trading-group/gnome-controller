"""List backtest runs (META records only), most recent first."""
from __future__ import annotations

import os
from decimal import Decimal

import boto3
from batch_runs import recent_runs
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
RUN_STATUSES = ("SUBMITTED", "PENDING", "RUNNING", "COMPLETED", "PARTIALLY_FAILED", "FAILED", "CANCELLED")
DEFAULT_LIMIT = 20

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


def handler(event: dict, context) -> dict:
    params = event.get("queryStringParameters") or {}
    try:
        limit = max(1, int(params.get("limit", DEFAULT_LIMIT)))
    except (ValueError, TypeError):
        limit = DEFAULT_LIMIT

    statuses = [params["status"]] if params.get("status") else RUN_STATUSES
    runs = _native(recent_runs(_table, statuses, limit))
    for run in runs:
        run.pop("config_yaml", None)
    return create_response(200, {"runs": runs, "count": len(runs)})
