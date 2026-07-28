"""Get service config, optionally merging with provided defaults."""
from __future__ import annotations

import base64
import json
import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _deep_merge(defaults: dict, overrides: dict) -> dict:
    """Merge two dicts recursively. overrides wins on conflict."""
    result = dict(defaults)
    for key, value in overrides.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def _has_new_keys(defaults: dict, stored: dict) -> bool:
    for key, value in defaults.items():
        if key not in stored:
            return True
        if isinstance(value, dict) and isinstance(stored[key], dict):
            if _has_new_keys(value, stored[key]):
                return True
    return False


def handler(event: dict, context) -> dict:
    service = event["pathParameters"]["service"]
    pk = f"SERVICE#{service}"

    response = _table.get_item(Key={"pk": pk, "sk": "CURRENT"})
    stored = response.get("Item")

    defaults_header = (event.get("headers") or {}).get("x-config-defaults")
    defaults = None
    if defaults_header:
        try:
            defaults = json.loads(base64.b64decode(defaults_header), parse_float=Decimal)
        except Exception:
            return create_response(400, {"error": "invalid x-config-defaults header"})

    if stored and defaults:
        config = stored["config"]
        if _has_new_keys(defaults, config):
            merged = _deep_merge(defaults, config)
            _table.put_item(Item={
                "pk": pk,
                "sk": "CURRENT",
                "config": merged,
                "version": stored["version"],
                "updated_at": _now_iso(),
                "updated_by": "service",
            })
            config = merged
        return create_response(200, {
            "config": config,
            "version": stored["version"],
            "updated_at": stored["updated_at"],
            "updated_by": stored["updated_by"],
        })

    if stored:
        return create_response(200, {
            "config": stored["config"],
            "version": stored["version"],
            "updated_at": stored["updated_at"],
            "updated_by": stored["updated_by"],
        })

    if defaults:
        now = _now_iso()
        _table.put_item(Item={
            "pk": pk,
            "sk": "CURRENT",
            "config": defaults,
            "version": 1,
            "updated_at": now,
            "updated_by": "service",
        })
        return create_response(200, {
            "config": defaults,
            "version": 1,
            "updated_at": now,
            "updated_by": "service",
        })

    return create_response(404, {"error": f"no config found for service '{service}'"})
