import json

import pytest

from conftest import load
from fakes import FakeLogs, FakeTable

logs = load()


def call(index="0", **params):
    response = logs.handler({"pathParameters": {"runId": "r1", "index": index}, "queryStringParameters": params}, None)
    return response["statusCode"], json.loads(response["body"])


@pytest.fixture
def aws(monkeypatch):
    table = FakeTable([
        {"run_id": "r1", "sk": "TASK#0000", "status": "RUNNING", "log_stream_name": "job/default/abc"},
        {"run_id": "r1", "sk": "TASK#0001", "status": "SUBMITTED"},
        {"run_id": "r1", "sk": "TASK#0002", "status": "RUNNING", "log_stream_name": "job/default/not-yet"},
    ])
    client = FakeLogs({"job/default/abc": [(i, f"line {i}") for i in range(7)]})
    monkeypatch.setattr(logs, "_table", table)
    monkeypatch.setattr(logs, "_logs", client)


def test_pages_walk_back_from_the_newest_lines_until_none_are_left(aws):
    status, page = call(limit="3")
    assert status == 200
    assert [l["message"] for l in page["lines"]] == ["line 4", "line 5", "line 6"]
    _, page = call(limit="3", before=page["before"])
    assert [l["at"] for l in page["lines"]] == [1, 2, 3]
    _, page = call(limit="3", before=page["before"])
    _, page = call(limit="3", before=page["before"])
    assert page == {"lines": [], "before": None}


def test_a_task_without_a_stream_yet_has_no_lines(aws):
    assert call("1") == (200, {"lines": [], "before": None})
    assert call("2") == (200, {"lines": [], "before": None})


def test_unknown_tasks_and_bad_indexes_are_refused(aws):
    assert call("9")[0] == 404
    assert call("x")[0] == 400
