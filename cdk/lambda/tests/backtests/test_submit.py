import json
import os
import sys

import pytest

from conftest import FUNCTIONS, load
from fakes import FakeBatch, FakeS3, FakeTable

os.environ.update({"BATCH_JOB_QUEUE": "backtests", "BATCH_JOB_DEFINITION": "backtest"})
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
