import json

import pytest

from conftest import load
from fakes import FakeS3, FakeTable

status = load("status-handler")
listing = load("list")


def rows(statuses, run_status="SUBMITTED"):
    meta = {"run_id": "r-1", "sk": "META", "status": run_status, "job_count": len(statuses),
            "submitted_at": "2026-10-20T00:00:00+00:00"}
    return [meta] + [{"run_id": "r-1", "sk": f"JOB#{i:04d}", "status": s, "array_index": i}
                     for i, s in enumerate(statuses)]


def batch_event(state, index, **extra):
    return {"detail": {"jobName": f"backtest-r-1-{index}", "jobId": f"job-{index}", "status": state, **extra}}


@pytest.fixture
def table(monkeypatch):
    s3 = FakeS3()
    s3.objects["backtests/r-1/jobs/0/summary.json"] = json.dumps({"final_pnl": 1.5, "sharpe": 2.0}).encode()
    monkeypatch.setattr(status, "_s3", s3)

    def make(items):
        t = FakeTable(items)
        monkeypatch.setattr(status, "_table", t)
        return t
    return make


def test_jobs_are_named_after_their_run_and_index():
    assert status.job_event({"jobName": "backtest-r-1-12"}) == ("r-1", 12)
    assert status.job_event({"jobName": "backtest-r-1-x"}) is None
    assert status.job_event({"jobName": "research-r1"}) is None


def test_a_run_counts_jobs_as_they_finish_and_records_why_they_failed(table):
    t = table(rows(["SUBMITTED", "SUBMITTED"]))
    status.handler(batch_event("RUNNING", 0, startedAt=1000, container={"logStreamName": "backtest/default/a"}), None)
    meta = t.items[("r-1", "META")]
    assert meta["status"] == "RUNNING" and "started_at" in meta

    status.handler(batch_event("SUCCEEDED", 0, stoppedAt=5000, container={"exitCode": 0}), None)
    meta = t.items[("r-1", "META")]
    assert (meta["status"], meta["completed_count"], meta["failed_count"]) == ("RUNNING", 1, 0), \
        "a run in progress counts the jobs that have finished"
    job = t.items[("r-1", "JOB#0000")]
    assert (job["started_at"], job["stopped_at"], float(job["final_pnl"])) == (1000, 5000, 1.5)

    status.handler(batch_event("FAILED", 1, container={"exitCode": 137}, statusReason="OutOfMemoryError",
                               attempts=[{}, {}]), None)
    meta = t.items[("r-1", "META")]
    assert (meta["status"], meta["completed_count"], meta["failed_count"]) == ("PARTIALLY_FAILED", 1, 1)
    assert "finished_at" in meta
    job = t.items[("r-1", "JOB#0001")]
    assert (job["exit_code"], job["status_reason"], job["attempt_count"]) == (137, "OutOfMemoryError", 2)


def test_a_summary_with_nan_or_infinity_is_stored_without_them(table, monkeypatch):
    s3 = FakeS3()
    s3.objects["backtests/r-1/jobs/0/summary.json"] = json.dumps(
        {"final_pnl": 1.5, "sharpe": float("nan"), "final_position": float("nan"), "sortino": float("inf"),
         "market_data_missing_fraction": 0.25}).encode()
    monkeypatch.setattr(status, "_s3", s3)
    t = table(rows(["RUNNING"]))

    status.handler(batch_event("SUCCEEDED", 0), None)

    job = t.items[("r-1", "JOB#0000")]
    assert set(job["summary"]) == {"final_pnl", "market_data_missing_fraction"}
    assert (float(job["final_pnl"]), float(job["sharpe"])) == (1.5, 0.0)


def test_a_late_event_does_not_undo_a_finished_job(table):
    t = table(rows(["FAILED", "SUBMITTED"]))
    status.handler(batch_event("RUNNING", 0), None)
    assert t.items[("r-1", "JOB#0000")]["status"] == "FAILED"


def test_a_cancelled_run_stays_cancelled_as_its_jobs_fail(table):
    t = table(rows(["RUNNING"], run_status="CANCELLED"))
    status.handler(batch_event("FAILED", 0, statusReason="Cancelled by user"), None)
    assert t.items[("r-1", "META")]["status"] == "CANCELLED"


def test_a_status_filtered_list_is_not_cut_short_by_job_rows(monkeypatch):
    class Index:
        """Two pages whose first holds only JOB rows, as a Limit applied before the filter would leave it."""
        def query(self, **kwargs):
            if "ExclusiveStartKey" not in kwargs:
                return {"Items": [], "LastEvaluatedKey": {"k": 1}}
            return {"Items": [{"run_id": "a", "sk": "META", "submitted_at": "2026-10-01", "config_yaml": "x"},
                              {"run_id": "b", "sk": "META", "submitted_at": "2026-10-02"}]}

    monkeypatch.setattr(listing, "_table", Index())
    body = json.loads(listing.handler({"queryStringParameters": {"status": "COMPLETED", "limit": "5"}}, None)["body"])
    assert [r["run_id"] for r in body["runs"]] == ["b", "a"]
    assert "config_yaml" not in body["runs"][1]
