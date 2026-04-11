"""EventBridge handler: sync Batch job state changes to DynamoDB."""
import datetime
import os
from typing import Any

import boto3

BACKTESTS_TABLE = os.environ["BACKTESTS_TABLE"]

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(BACKTESTS_TABLE)

# Batch statuses we care about.
TERMINAL_STATUSES = {"SUCCEEDED", "FAILED"}


def handler(event: dict[str, Any], context: Any) -> None:
    detail = event.get("detail", {})
    batch_job_id = detail.get("jobId")
    status = detail.get("status")

    if not batch_job_id or not status:
        return

    # Find the DynamoDB item by scanning for the batchJobId.
    # With low volume this is fine; at scale add a GSI on batchJobId.
    result = table.scan(
        FilterExpression="batchJobId = :bjid",
        ExpressionAttributeValues={":bjid": batch_job_id},
    )
    items = result.get("Items", [])
    if not items:
        return

    job_id = items[0]["jobId"]
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    update_expr = "SET #s = :status, updatedAt = :now"
    expr_values: dict[str, Any] = {":status": status, ":now": now}
    expr_names = {"#s": "status"}

    if status in TERMINAL_STATUSES:
        update_expr += ", completedAt = :now"

    if status == "FAILED":
        reason = detail.get("statusReason", "Unknown error")
        update_expr += ", #err = :err"
        expr_values[":err"] = reason
        expr_names["#err"] = "error"

    table.update_item(
        Key={"jobId": job_id},
        UpdateExpression=update_expr,
        ExpressionAttributeValues=expr_values,
        ExpressionAttributeNames=expr_names,
    )
