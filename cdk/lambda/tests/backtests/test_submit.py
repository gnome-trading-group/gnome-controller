import json
import os
import sys

import pytest

from conftest import FUNCTIONS, load
from fakes import FakeBatch, FakeS3, FakeTable

os.environ.update({"BATCH_JOB_QUEUE": "backtests", "BATCH_JOB_DEFINITION": "backtest", "DEFAULT_CPU": "2",
                   "DEFAULT_MEMORY_GIB": "8"})
sys.path.insert(0, os.path.join(FUNCTIONS, "submit"))
submit = load("submit")

SHA = "a" * 40
CONFIG = "strategy:\n  class_name: group.gnometrading.strategies.check.PlatformCheck\nlistings:\n  - listing_id: 1\n"


@pytest.fixture
def aws(monkeypatch):
    batch, table = FakeBatch(), FakeTable()
    monkeypatch.setattr(submit, "_s3", FakeS3())
    monkeypatch.setattr(submit, "_batch", batch)
    monkeypatch.setattr(submit, "_table", table)
    return batch, table


def post(body):
    return submit.handler({"body": json.dumps({"config": CONFIG, **body})}, None)


def env(batch):
    return {e["name"]: e["value"] for e in batch.submitted[0]["containerOverrides"]["environment"]}


def meta(table):
    return next(item for (_, sk), item in table.items.items() if sk == "META")


def test_a_strategy_commit_runs_without_a_research_commit(aws):
    batch, table = aws
    assert post({"strategy_commit": SHA, "engine_version": "1.5.1"})["statusCode"] == 200
    assert env(batch)["STRATEGY_COMMIT"] == SHA
    assert env(batch)["ENGINE_VERSION"] == "1.5.1"
    assert "RESEARCH_COMMIT" not in env(batch)
    assert meta(table)["strategy_commit"] == SHA
    assert meta(table)["engine_version"] == "1.5.1"
    assert "research_commit" not in meta(table)


def test_research_commit_defaults_to_main_alone(aws):
    batch, table = aws
    assert post({})["statusCode"] == 200
    assert env(batch)["RESEARCH_COMMIT"] == "main"
    assert "STRATEGY_COMMIT" not in env(batch)
    assert meta(table)["research_commit"] == "main"


def test_both_commits_go_to_the_job(aws):
    batch, _ = aws
    assert post({"research_commit": "b" * 40, "strategy_commit": SHA})["statusCode"] == 200
    assert env(batch)["RESEARCH_COMMIT"] == "b" * 40
    assert env(batch)["STRATEGY_COMMIT"] == SHA


@pytest.mark.parametrize("body, message", [
    ({"strategy_commit": "main"}, "40-character"),
    ({"strategy_commit": SHA.upper()}, "40-character"),
    ({"engine_version": "1.5.1-SNAPSHOT"}, "release"),
    ({"engine_version": 151}, "release"),
])
def test_unrunnable_sources_are_refused(aws, body, message):
    batch, _ = aws
    res = post(body)
    assert res["statusCode"] == 400
    assert message in json.loads(res["body"])["error"]
    assert batch.submitted == []


def test_a_run_keeps_the_job_definitions_size_unless_it_asks(aws):
    batch, table = aws
    assert post({})["statusCode"] == 200
    assert "resourceRequirements" not in batch.submitted[0]["containerOverrides"]
    assert (meta(table)["cpu"], meta(table)["memory_gib"]) == (2, 8)


def test_a_run_sized_by_its_submit_runs_every_job_at_that_size(aws):
    batch, table = aws
    assert post({"cpu": 2, "memory_gib": 16})["statusCode"] == 200
    assert batch.submitted[0]["containerOverrides"]["resourceRequirements"] == [
        {"type": "VCPU", "value": "2"}, {"type": "MEMORY", "value": "16384"}]
    assert (meta(table)["cpu"], meta(table)["memory_gib"]) == (2, 16)


def test_memory_alone_keeps_the_default_vcpus(aws):
    batch, _ = aws
    assert post({"memory_gib": 12})["statusCode"] == 200
    assert batch.submitted[0]["containerOverrides"]["resourceRequirements"] == [{"type": "MEMORY", "value": "12288"}]


@pytest.mark.parametrize("body, message", [
    ({"cpu": 0}, "cpu"),
    ({"cpu": 9}, "cpu"),
    ({"cpu": 2.5}, "cpu"),
    ({"cpu": True}, "cpu"),
    ({"memory_gib": 31}, "memory_gib"),
    ({"memory_gib": "8"}, "memory_gib"),
    ({"report": "no"}, "report"),
])
def test_sizes_no_instance_holds_and_odd_values_are_refused(aws, body, message):
    batch, _ = aws
    res = post(body)
    assert res["statusCode"] == 400
    assert message in json.loads(res["body"])["error"]
    assert batch.submitted == []


def test_a_run_without_the_report_tells_its_jobs(aws):
    batch, table = aws
    assert post({"report": False})["statusCode"] == 200
    assert env(batch)["NO_REPORT"] == "1"
    assert meta(table)["report"] is False


def test_a_run_writes_its_report_by_default(aws):
    batch, table = aws
    assert post({})["statusCode"] == 200
    assert "NO_REPORT" not in env(batch)
    assert meta(table)["report"] is True


SWEEP = CONFIG.replace("PlatformCheck\n", "PlatformCheck\n  args: {}\n") + "sweep:\n  strategy:\n    spread: [1, 2, 3]\n"


def test_a_sweep_is_one_array_job_with_a_row_and_config_per_job(aws, monkeypatch):
    batch, table = aws
    s3 = FakeS3()
    monkeypatch.setattr(submit, "_s3", s3)
    res = submit.handler({"body": json.dumps({"config": SWEEP})}, None)
    assert res["statusCode"] == 200
    assert len(batch.submitted) == 1
    job = batch.submitted[0]
    assert (job["jobName"], job["arrayProperties"]) == (f"backtest-{meta(table)['run_id']}", {"size": 3})
    assert "JOB_INDEX" not in env(batch), "each child reads its own AWS_BATCH_JOB_ARRAY_INDEX"
    jobs = sorted(sk for (_, sk) in table.items if sk.startswith("JOB#"))
    assert jobs == ["JOB#0000", "JOB#0001", "JOB#0002"]
    assert all("submitted_at" not in table.items[(r, sk)] for (r, sk) in table.items if sk.startswith("JOB#")), \
        "job rows stay out of the status index"
    assert sum(k.endswith("/config.yaml") and "/jobs/" in k for k in s3.objects) == 3
    assert meta(table)["batch_job_id"] == "job-1"


def test_a_single_job_is_a_plain_job(aws):
    batch, _ = aws
    assert post({})["statusCode"] == 200
    assert "arrayProperties" not in batch.submitted[0]


def test_a_failed_batch_submit_marks_the_run_failed(aws, monkeypatch):
    _, table = aws
    monkeypatch.setattr(submit, "_batch", FakeBatch(fail=True))
    with pytest.raises(RuntimeError):
        post({})
    assert meta(table)["status"] == "FAILED"


SCENARIOS = CONFIG.replace("listings:\n  - listing_id: 1\n", "scenarios:\n") + "".join(
    f"  s{i}:\n    start_date: 2026-10-01\n    end_date: 2026-10-02\n    listings:\n      - listing_id: {i}\n"
    for i in range(3))


def test_meta_holds_neither_the_config_text_nor_the_scenario_names(aws, monkeypatch):
    batch, table = aws
    s3 = FakeS3()
    monkeypatch.setattr(submit, "_s3", s3)
    assert submit.handler({"body": json.dumps({"config": SCENARIOS})}, None)["statusCode"] == 200
    run = meta(table)
    assert "config_yaml" not in run and "scenarios" not in run
    assert table.items[(run["run_id"], "CONFIG")]["scenarios"] == ["s0", "s1", "s2"]
    assert s3.objects[f"backtests/{run['run_id']}/config.yaml"] == SCENARIOS.encode(), "the config as submitted"


def test_a_run_without_scenarios_has_no_config_row(aws):
    _, table = aws
    assert post({})["statusCode"] == 200
    assert [sk for (_, sk) in table.items if not sk.startswith("JOB#")] == ["META"]
