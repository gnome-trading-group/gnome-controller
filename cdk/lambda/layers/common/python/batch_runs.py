"""Run-level bookkeeping shared by the Batch status handlers of backtests and research jobs.

A run is a META row plus one row per task, all under the run's partition key. Counting finished tasks by reading the
whole run on every finish makes a run of N tasks cost N² reads on one partition, which DynamoDB throttles once runs
reach the hundreds, so the META row keeps its own counts instead.
"""
from __future__ import annotations

from datetime import datetime, timezone

from boto3.dynamodb.conditions import Attr, Key

# The task indexes already counted. A Lambda retried after its count landed must not count the same task twice.
FINISHED_INDEXES = "finished_indexes"


def array_task(detail: dict, prefix: str) -> tuple[str, int] | None:
    """(run_id, index) of a task's event: an array child, or a run of one submitted as a plain job (index 0).

    None for the array parent, which reports a size while its children report their own states, and for other jobs.
    """
    name = detail.get("jobName", "")
    if not name.startswith(prefix):
        return None
    array = detail.get("arrayProperties") or {}
    if "index" in array:
        return name[len(prefix):], int(array["index"])
    if "size" in array:
        return None
    return name[len(prefix):], 0


def final_status(succeeded: int, failed: int, total: int) -> str | None:
    """The run's final status, or None while any task is unfinished."""
    if succeeded + failed < total:
        return None
    if failed == 0:
        return "COMPLETED"
    return "FAILED" if failed == total else "PARTIALLY_FAILED"


def count_finished(table, run_id: str, index: int, counter: str) -> dict | None:
    """Add one to `counter` on the run's META row for this task, once only; the META row afterwards, None if absent."""
    try:
        return table.update_item(
            Key={"run_id": run_id, "sk": "META"},
            UpdateExpression=f"ADD {counter} :one, {FINISHED_INDEXES} :idx",
            ConditionExpression=f"attribute_exists(sk) AND NOT contains({FINISHED_INDEXES}, :i)",
            ExpressionAttributeValues={":one": 1, ":idx": {index}, ":i": index},
            ReturnValues="ALL_NEW",
        )["Attributes"]
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        return table.get_item(Key={"run_id": run_id, "sk": "META"}, ConsistentRead=True).get("Item")


def set_run_status(table, run_id: str, status: str, allowed_from: tuple[str, ...], stamp: str) -> None:
    values: dict = {":s": status, ":t": datetime.now(timezone.utc).isoformat(),
                    **{f":from{i}": s for i, s in enumerate(allowed_from)}}
    try:
        table.update_item(
            Key={"run_id": run_id, "sk": "META"},
            UpdateExpression=f"SET #st = :s, {stamp} = :t",
            ConditionExpression=f"#st IN ({', '.join(f':from{i}' for i in range(len(allowed_from)))})",
            ExpressionAttributeNames={"#st": "status"},
            ExpressionAttributeValues=values,
        )
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        pass


def finish_task(table, run_id: str, index: int, succeeded: bool, counters: tuple[str, str], total_field: str,
                unfinished: tuple[str, ...]) -> None:
    """Count a finished task and, once every task has, give the run its final status.

    `counters` names the (succeeded, failed) count fields. A cancelled run is not in `unfinished`, so it stays
    CANCELLED as its terminated tasks fail.
    """
    meta = count_finished(table, run_id, index, counters[0] if succeeded else counters[1])
    if meta is None:
        return
    final = final_status(int(meta.get(counters[0], 0)), int(meta.get(counters[1], 0)), int(meta[total_field]))
    if final:
        set_run_status(table, run_id, final, unfinished, "finished_at")


def recent_runs(table, statuses: list[str], limit: int) -> list[dict]:
    """The newest `limit` runs in any of `statuses`, newest first, read from the status index.

    The index is sparse to META rows (only they carry submitted_at), so a page holds runs; the META filter covers
    task rows written before that held.
    """
    runs = []
    for status in statuses:
        kwargs = {"IndexName": "status-submitted-index", "KeyConditionExpression": Key("status").eq(status),
                  "FilterExpression": Attr("sk").eq("META"), "ScanIndexForward": False}
        found = []
        while len(found) < limit:
            response = table.query(**kwargs)
            found += response.get("Items", [])
            if "LastEvaluatedKey" not in response:
                break
            kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
        runs += found[:limit]
    runs = sorted(runs, key=lambda r: r.get("submitted_at", ""), reverse=True)[:limit]
    for run in runs:
        run.pop(FINISHED_INDEXES, None)
    return runs
