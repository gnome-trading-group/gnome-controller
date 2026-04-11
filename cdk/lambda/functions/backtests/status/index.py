"""List backtests or get a single backtest with presigned report URL."""
import os
from typing import Any

import boto3

from utils import create_response

BACKTESTS_TABLE = os.environ["BACKTESTS_TABLE"]
RESULTS_BUCKET = os.environ["RESULTS_BUCKET"]

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(BACKTESTS_TABLE)
s3_client = boto3.client("s3")


def _presigned_report_url(job_id: str) -> str | None:
    """Generate a 1-hour presigned URL for the report.html, or None if it doesn't exist."""
    key = f"backtests/{job_id}/report.html"
    try:
        s3_client.head_object(Bucket=RESULTS_BUCKET, Key=key)
    except s3_client.exceptions.ClientError:
        return None
    return s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": RESULTS_BUCKET, "Key": key},
        ExpiresIn=3600,
    )


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    path = event.get("path", "")
    path_params = event.get("pathParameters") or {}

    job_id = path_params.get("id")

    if job_id:
        # GET /backtests/{id}
        item = table.get_item(Key={"jobId": job_id}).get("Item")
        if not item:
            return create_response(404, {"error": f"Job {job_id} not found"})

        if item.get("status") == "SUCCEEDED":
            item["reportUrl"] = _presigned_report_url(job_id)

        return create_response(200, item)

    # GET /backtests — list all jobs, newest first.
    result = table.scan()
    jobs = sorted(result.get("Items", []), key=lambda j: j.get("submittedAt", ""), reverse=True)
    return create_response(200, {"jobs": jobs})
