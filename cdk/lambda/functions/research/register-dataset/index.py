"""Register dataset metadata in DynamoDB after client-side S3 upload."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
_DATASETS_PK = "__datasets__"

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)


def handler(event: dict, context) -> dict:
    try:
        body = json.loads(event.get("body") or "{}", parse_float=Decimal)
    except json.JSONDecodeError:
        return create_response(400, {"error": "invalid JSON body"})

    required = ["name", "version", "s3_uri", "file_format", "size_bytes"]
    for field in required:
        if field not in body:
            return create_response(400, {"error": f"missing required field: {field}"})

    claims = (event.get("requestContext") or {}).get("authorizer", {}).get("claims", {})
    created_by = claims.get("email") or claims.get("cognito:username", "cli")

    name = body["name"]
    version = int(body["version"])

    item: dict = {
        "session_name": _DATASETS_PK,
        "sk": f"DATASET#{name}#{version}",
        "dataset_name": name,
        "version": version,
        "s3_uri": body["s3_uri"],
        "file_format": body["file_format"],
        "size_bytes": int(body["size_bytes"]),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": created_by,
        "description": body.get("description", ""),
    }
    if "row_count" in body:
        item["row_count"] = int(body["row_count"])
    if "columns" in body:
        item["columns"] = body["columns"]
    if "producing_session" in body:
        item["producing_session"] = body["producing_session"]

    try:
        _table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(sk)",
        )
    except _ddb.meta.client.exceptions.ConditionalCheckFailedException:
        return create_response(409, {"error": f"dataset {name}:{version} already registered"})

    return create_response(201, {"name": name, "version": version})
