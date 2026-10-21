import json

import pytest

from conftest import load
from fakes import FakeBatch, FakeTable

status = load("status-handler")
get = load("get")
listing = load("list")
cancel = load("cancel")


def rows(statuses, run_status="SUBMITTED"):
    meta = {"run_id": "r1", "sk": "META", "status": run_status, "task_count": len(statuses),
            "submitted_at": "2026-10-20T00:00:00+00:00", "batch_job_id": "job-1"}
    return [meta] + [{"run_id": "r1", "sk": f"TASK#{i:04d}", "status": s, "array_index": i}
                     for i, s in enumerate(statuses)]


def batch_event(state, index=None, **extra):
    detail = {"jobName": "research-r1", "jobId": f"job-1:{index}", "status": state, **extra}
    if index is not None:
        detail["arrayProperties"] = {"index": index}
    return {"detail": detail}


@pytest.fixture
def table(monkeypatch):
    def make(items):
        t = FakeTable(items)
        for module in (status, get, cancel):
            monkeypatch.setattr(module, "_table", t)
        return t
    return make


def test_children_and_plain_jobs_are_tasks_but_the_array_parent_is_not():
    assert status.task_event(batch_event("RUNNING", 7)["detail"]) == ("r1", 7)
    assert status.task_event(batch_event("RUNNING")["detail"]) == ("r1", 0)
    assert status.task_event({"jobName": "research-r1", "arrayProperties": {"size": 13}}) is None
    assert status.task_event({"jobName": "backtest-r1-0"}) is None


@pytest.mark.parametrize("statuses, expected", [
    (["SUCCEEDED", "SUCCEEDED"], "COMPLETED"),
    (["SUCCEEDED", "FAILED"], "PARTIALLY_FAILED"),
    (["FAILED", "FAILED"], "FAILED"),
    (["SUCCEEDED", "RUNNING"], None),
    (["SUCCEEDED"], None),
])
def test_a_run_finishes_only_when_every_task_has(statuses, expected):
    assert status.run_status(statuses, 2) == expected


def test_a_run_goes_running_then_completes_as_its_tasks_finish(table):
    t = table(rows(["SUBMITTED", "SUBMITTED"]))
    status.handler(batch_event("RUNNING", 0, container={"logStreamName": "gnome-research-job/default/abc"}), None)
    assert t.items[("r1", "META")]["status"] == "RUNNING"
    assert "started_at" in t.items[("r1", "META")]
    assert t.items[("r1", "TASK#0000")]["log_stream_name"] == "gnome-research-job/default/abc"

    status.handler(batch_event("SUCCEEDED", 0, container={"exitCode": 0}), None)
    meta = t.items[("r1", "META")]
    assert (meta["status"], meta["succeeded_count"], meta["failed_count"]) == ("RUNNING", 1, 0), \
        "a run in progress counts the tasks that have finished"
    status.handler(batch_event("FAILED", 1, container={"exitCode": 1}, statusReason="Essential container exited"), None)
    meta = t.items[("r1", "META")]
    assert (meta["status"], meta["succeeded_count"], meta["failed_count"]) == ("PARTIALLY_FAILED", 1, 1)
    assert "finished_at" in meta
    assert t.items[("r1", "TASK#0001")]["status_reason"] == "Essential container exited"


def test_a_late_event_does_not_undo_a_finished_task(table):
    t = table(rows(["SUCCEEDED", "SUBMITTED"]))
    status.handler(batch_event("RUNNING", 0), None)
    assert t.items[("r1", "TASK#0000")]["status"] == "SUCCEEDED"


def test_a_cancelled_run_stays_cancelled_as_its_tasks_fail(table):
    t = table(rows(["SUBMITTED"], run_status="RUNNING"))
    response = cancel.handler({"pathParameters": {"runId": "r1"}}, None)
    assert json.loads(response["body"])["status"] == "CANCELLED"
    status.handler(batch_event("FAILED", None, statusReason="Cancelled by user"), None)
    assert t.items[("r1", "META")]["status"] == "CANCELLED"


def test_cancel_terminates_the_job_once_and_refuses_finished_runs(table, monkeypatch):
    batch = FakeBatch()
    monkeypatch.setattr(cancel, "_batch", batch)
    table(rows(["RUNNING"], run_status="RUNNING"))
    assert cancel.handler({"pathParameters": {"runId": "r1"}}, None)["statusCode"] == 200
    assert batch.terminated == ["job-1"]
    assert cancel.handler({"pathParameters": {"runId": "r1"}}, None)["statusCode"] == 409
    assert cancel.handler({"pathParameters": {"runId": "nope"}}, None)["statusCode"] == 404


def test_get_returns_tasks_in_order_with_their_logs_and_outputs(table):
    items = rows(["SUCCEEDED", "RUNNING"])
    items[2]["log_stream_name"] = "gnome-research-job/default/abc"
    table(list(reversed(items)))
    body = json.loads(get.handler({"pathParameters": {"runId": "r1"}}, None)["body"])
    assert [t["array_index"] for t in body["tasks"]] == [0, 1]
    assert body["tasks"][0]["output_prefix"] == "s3://gnome-research-dev/research-jobs/runs/r1/jobs/0/out/"
    assert "log_url" not in body["tasks"][0]
    assert "gnome-research-job$252Fdefault$252Fabc" in body["tasks"][1]["log_url"]
    assert get.handler({"pathParameters": {"runId": "nope"}}, None)["statusCode"] == 404


def test_list_returns_runs_newest_first(monkeypatch):
    class Scan:
        def scan(self, **kwargs):
            return {"Items": [{"run_id": "old", "submitted_at": "2026-10-01"}, {"run_id": "new", "submitted_at": "2026-10-20"}]}

    monkeypatch.setattr(listing, "_table", Scan())
    body = json.loads(listing.handler({"queryStringParameters": {"limit": "1"}}, None)["body"])
    assert [r["run_id"] for r in body["runs"]] == ["new"]
