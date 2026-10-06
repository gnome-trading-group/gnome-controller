"""List a service's saved config versions, newest first (Cognito-authenticated, UI only)."""
from __future__ import annotations

import os

import boto3
from boto3.dynamodb.conditions import Key
from utils import create_response

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
MAX_VERSIONS = 100

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)


def handler(event: dict, context) -> dict:
    service = event["pathParameters"]["service"]

    response = _table.query(
        KeyConditionExpression=Key("pk").eq(f"SERVICE#{service}") & Key("sk").begins_with("VERSION#"),
        ScanIndexForward=False,
        Limit=MAX_VERSIONS,
    )

    return create_response(200, {
        "versions": [
            {
                "version": item["version"],
                "config": item["config"],
                "updated_at": item["updated_at"],
                "updated_by": item["updated_by"],
            }
            for item in response.get("Items", [])
        ],
    })
