import json

import pytest

from conftest import load
from fakes import FakeBatch, FakeS3, FakeTable

status = load("status-handler")
listing = load("list")
get = load("get")
cancel = load("cancel")


def rows(statuses, run_status="SUBMITTED"):
    meta = {"run_id": "r-1", "sk": "META", "status": run_status, "job_count": len(statuses),
            "completed_count": 0, "failed_count": 0, "submitted_at": "2026-10-20T00:00:00+00:00",
            "batch_job_id": "job-1"}
    return [meta] + [{"run_id": "r-1", "sk": f"JOB#{i:04d}", "status": s, "array_index": i}
                     for i, s in enumerate(statuses)]


def batch_event(state, index, **extra):
    return {"detail": {"jobName": "backtest-r-1", "jobId": f"job-1:{index}", "status": state,
                       "arrayProperties": {"index": index}, **extra}}


@pytest.fixture
def table(monkeypatch):
    s3 = FakeS3()
    s3.objects["backtests/r-1/jobs/0/summary.json"] = json.dumps({"final_pnl": 1.5, "sharpe": 2.0}).encode()
    monkeypatch.setattr(status, "_s3", s3)

    def make(items):
        t = FakeTable(items)
        for module in (status, get, cancel):
            monkeypatch.setattr(module, "_table", t)
        return t
    return make


def test_array_children_and_a_plain_job_are_jobs_but_the_array_parent_is_not():
    assert status.array_task(batch_event("RUNNING", 12)["detail"], "backtest-") == ("r-1", 12)
    assert status.array_task({"jobName": "backtest-r-1"}, "backtest-") == ("r-1", 0)
    assert status.array_task({"jobName": "backtest-r-1", "arrayProperties": {"size": 300}}, "backtest-") is None
    assert status.array_task({"jobName": "research-r1"}, "backtest-") is None


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


def test_a_retried_finish_is_counted_once(table):
    t = table(rows(["RUNNING", "RUNNING"]))
    status.handler(batch_event("FAILED", 1), None)
    status.handler(batch_event("FAILED", 1), None)
    meta = t.items[("r-1", "META")]
    assert (meta["completed_count"], meta["failed_count"]) == (0, 1)
    assert meta["status"] == "SUBMITTED"


def test_a_retry_after_the_count_landed_still_finalizes_the_run(table):
    """The count went in but the Lambda died before finalizing; the retry finds the job counted and finalizes."""
    t = table(rows(["SUCCEEDED", "FAILED"]))
    t.items[("r-1", "META")].update(completed_count=1, failed_count=1, finished_indexes={0, 1})
    status.handler(batch_event("FAILED", 1), None)
    assert t.items[("r-1", "META")]["status"] == "PARTIALLY_FAILED"


def test_a_run_of_hundreds_finishes_without_reading_its_jobs(table, monkeypatch):
    t = table(rows(["RUNNING"] * 300))
    monkeypatch.setattr(t, "query", lambda **_: pytest.fail("a finish must not read the whole run"))
    for i in range(300):
        status.handler(batch_event("SUCCEEDED" if i % 3 else "FAILED", i), None)
    meta = t.items[("r-1", "META")]
    assert (meta["status"], meta["completed_count"], meta["failed_count"]) == ("PARTIALLY_FAILED", 200, 100)


def test_get_links_reports_of_jobs_with_a_summary_and_hides_the_counted_set(table):
    t = table(rows(["SUCCEEDED", "SUCCEEDED", "FAILED"]))
    t.items[("r-1", "JOB#0000")]["summary"] = {"final_pnl": 1}
    t.items[("r-1", "META")]["finished_indexes"] = {0, 1, 2}
    body = json.loads(get.handler({"pathParameters": {"runId": "r-1"}}, None)["body"])
    assert "finished_indexes" not in body
    assert [("report_url" in j) for j in body["jobs"]] == [True, False, False]


def test_cancel_terminates_the_array_parent_once(table, monkeypatch):
    batch = FakeBatch()
    monkeypatch.setattr(cancel, "_batch", batch)
    t = table(rows(["RUNNING"] * 50, run_status="RUNNING"))
    assert cancel.handler({"pathParameters": {"runId": "r-1"}}, None)["statusCode"] == 200
    assert batch.terminated == ["job-1"]
    assert t.items[("r-1", "META")]["status"] == "CANCELLED"


def test_the_list_reads_the_newest_runs_of_each_status_and_drops_job_rows(monkeypatch):
    class Index:
        """Per status, newest first, in pages of two; the first FAILED page holds only a job row from before the
        index was sparse."""
        def __init__(self):
            self.pages = {
                "COMPLETED": [[{"run_id": "c2", "sk": "META", "submitted_at": "2026-10-04", "config_yaml": "x"},
                               {"run_id": "c1", "sk": "META", "submitted_at": "2026-10-01"}]],
                "FAILED": [[], [{"run_id": "f1", "sk": "META", "submitted_at": "2026-10-03",
                                 "finished_indexes": {0}}]],
            }

        def query(self, **kwargs):
            status = kwargs["KeyConditionExpression"].get_expression()["values"][1]
            assert kwargs["ScanIndexForward"] is False
            pages = self.pages.get(status, [[]])
            page = int(kwargs.get("ExclusiveStartKey", {}).get("page", 0))
            response = {"Items": pages[page]}
            if page + 1 < len(pages):
                response["LastEvaluatedKey"] = {"page": page + 1}
            return response

    monkeypatch.setattr(listing, "_table", Index())
    body = json.loads(listing.handler({"queryStringParameters": {"limit": "2"}}, None)["body"])
    assert [r["run_id"] for r in body["runs"]] == ["c2", "f1"]
    assert "config_yaml" not in body["runs"][0] and "finished_indexes" not in body["runs"][1]
