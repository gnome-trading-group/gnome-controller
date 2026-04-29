"""CRUD for backtest presets stored in DynamoDB."""
import datetime
import json
import os
import secrets
import time
from typing import Any

import boto3

from utils import create_response

PRESETS_TABLE = os.environ["PRESETS_TABLE"]

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(PRESETS_TABLE)


def _uuid7() -> str:
    ms = int(time.time() * 1000) & 0xFFFFFFFFFFFF
    ra = secrets.randbits(12)
    rb = secrets.randbits(62)
    n = (ms << 80) | (0x7 << 76) | (ra << 64) | (0b10 << 62) | rb
    h = f"{n:032x}"
    return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def _get_user(event: dict) -> str:
    claims = (event.get("requestContext", {})
              .get("authorizer", {})
              .get("claims", {}))
    return claims.get("email") or claims.get("cognito:username", "unknown")


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    method = event.get("httpMethod", "GET")
    path_params = event.get("pathParameters") or {}
    preset_id = path_params.get("id")

    if method == "GET":
        if preset_id:
            item = table.get_item(Key={"presetId": preset_id}).get("Item")
            if not item:
                return create_response(404, {"error": f"Preset {preset_id} not found"})
            return create_response(200, item)
        # List all presets.
        result = table.scan()
        presets = sorted(result.get("Items", []), key=lambda p: p.get("createdAt", ""))
        return create_response(200, {"presets": presets})

    if method == "POST":
        try:
            body = json.loads(event.get("body") or "{}")
        except (json.JSONDecodeError, TypeError):
            return create_response(400, {"error": "Invalid JSON body"})

        name = body.get("name")
        config = body.get("config")
        if not name or not config:
            return create_response(400, {"error": "name and config are required"})

        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        item = {
            "presetId": _uuid7(),
            "name": name,
            "description": body.get("description", ""),
            "config": config,
            "createdBy": _get_user(event),
            "createdAt": now,
            "updatedAt": now,
        }
        table.put_item(Item=item)
        return create_response(201, item)

    if method == "PUT":
        if not preset_id:
            return create_response(400, {"error": "Preset ID required"})
        try:
            body = json.loads(event.get("body") or "{}")
        except (json.JSONDecodeError, TypeError):
            return create_response(400, {"error": "Invalid JSON body"})

        existing = table.get_item(Key={"presetId": preset_id}).get("Item")
        if not existing:
            return create_response(404, {"error": f"Preset {preset_id} not found"})

        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        existing["name"] = body.get("name", existing["name"])
        existing["description"] = body.get("description", existing.get("description", ""))
        existing["config"] = body.get("config", existing["config"])
        existing["updatedAt"] = now
        table.put_item(Item=existing)
        return create_response(200, existing)

    if method == "DELETE":
        if not preset_id:
            return create_response(400, {"error": "Preset ID required"})
        table.delete_item(Key={"presetId": preset_id})
        return create_response(200, {"deleted": preset_id})

    return create_response(405, {"error": f"Method {method} not allowed"})
