import json

import pytest

from conftest import load
from fakes import FakeBatch, FakeS3, FakeTable

submit = load("submit")

SHA = "a" * 40
DIGEST = "b" * 64
GOOD = {"module": "gnomepy_research.sessions.demo.job", "research_commit": SHA, "args": ["--n", "3"]}


def event(body, email="mason@gnometrading.group"):
    return {"body": json.dumps(body), "requestContext": {"authorizer": {"kind": "person", "actor": email, "email": email}}}


@pytest.fixture
def aws(monkeypatch):
    s3, batch, table = FakeS3([f"research-jobs/inputs/{DIGEST}/manifest.json"]), FakeBatch(), FakeTable()
    monkeypatch.setattr(submit, "_s3", s3)
    monkeypatch.setattr(submit, "_batch", batch)
    monkeypatch.setattr(submit, "_table", table)
    return s3, batch, table


@pytest.mark.parametrize("change, message", [
    ({"module": "not a module"}, "module"),
    ({"module": "pkg..mod"}, "module"),
    ({"research_commit": "main"}, "40-character"),
    ({"args": "--n 3"}, "args"),
    ({"array": [["a"]]}, "not both"),
    ({"args": None, "array": []}, "non-empty"),
    ({"args": None, "array": [["a"], [1]]}, r"array\[1\]"),
    ({"args": None, "array": [[]] * 1001}, "at most 1000"),
    ({"inputs": {"bad name": DIGEST}}, "input name"),
    ({"inputs": {"data": "s3://elsewhere/"}}, "sha256"),
    ({"cpu": 0}, "cpu"),
    ({"cpu": 17}, "cpu"),
    ({"cpu": True}, "cpu"),
    ({"memory_gib": 61}, "memory_gib"),
])
def test_malformed_requests_are_refused(change, message):
    with pytest.raises(ValueError, match=message):
        submit.parse({**GOOD, **change})


def test_an_array_runs_one_task_per_argument_list():
    request = submit.parse({**GOOD, "args": None, "array": [["fit", "2025-09"], ["fit", "2025-10"]],
                            "inputs": {"data": DIGEST}, "cpu": 4, "memory_gib": 14})
    assert request["tasks"] == [["fit", "2025-09"], ["fit", "2025-10"]]
    assert submit.task_spec(request, request["tasks"][1]) == {
        "module": GOOD["module"],
        "args": ["fit", "2025-10"],
        "inputs": {"data": f"s3://gnome-research-dev/research-jobs/inputs/{DIGEST}/"},
    }
    kwargs = submit.submit_job_kwargs("r1", request)
    assert kwargs["jobName"] == "research-r1"
    assert kwargs["arrayProperties"] == {"size": 2}
    assert kwargs["containerOverrides"]["resourceRequirements"] == [
        {"type": "VCPU", "value": "4"}, {"type": "MEMORY", "value": str(14 * 1024)}]
    assert {"name": "RESEARCH_COMMIT", "value": SHA} in kwargs["containerOverrides"]["environment"]


def test_one_task_runs_as_a_plain_job_on_the_definitions_resources():
    kwargs = submit.submit_job_kwargs("r1", submit.parse(GOOD))
    assert "arrayProperties" not in kwargs
    assert "resourceRequirements" not in kwargs["containerOverrides"]


def test_submit_writes_the_task_specs_and_rows_then_submits_one_job(aws, monkeypatch):
    s3, batch, table = aws
    monkeypatch.setattr(submit, "run_id", lambda: "r1")
    body = {**GOOD, "args": None, "array": [["a"], ["b"], ["c"]], "inputs": {"data": DIGEST}}
    response = submit.handler(event(body), None)
    assert response["statusCode"] == 200, response["body"]
    assert json.loads(response["body"])["output_prefix"] == "s3://gnome-research-dev/research-jobs/runs/r1/"

    assert json.loads(s3.objects["research-jobs/runs/r1/jobs/2/task.json"])["args"] == ["c"]
    assert json.loads(s3.objects["research-jobs/runs/r1/request.json"])["submitted_by"] == "mason@gnometrading.group"
    assert len(batch.submitted) == 1 and batch.submitted[0]["arrayProperties"] == {"size": 3}

    meta = table.items[("r1", "META")]
    assert meta["status"] == "SUBMITTED" and meta["task_count"] == 3 and meta["batch_job_id"] == "job-1"
    assert (meta["cpu"], meta["memory_gib"]) == (4, 14)
    assert [table.items[("r1", f"TASK#{i:04d}")]["args"] for i in range(3)] == [["a"], ["b"], ["c"]]


def test_inputs_that_were_never_uploaded_are_refused_before_anything_is_written(aws):
    s3, batch, table = aws
    response = submit.handler(event({**GOOD, "inputs": {"data": "c" * 64}}), None)
    assert response["statusCode"] == 400
    assert "data" in json.loads(response["body"])["error"]
    assert not batch.submitted and not table.items


def test_a_failed_batch_submit_marks_the_run_failed(aws, monkeypatch):
    _, _, table = aws
    monkeypatch.setattr(submit, "_batch", FakeBatch(fail=True))
    monkeypatch.setattr(submit, "run_id", lambda: "r1")
    with pytest.raises(RuntimeError):
        submit.handler(event(GOOD), None)
    assert table.items[("r1", "META")]["status"] == "FAILED"
    assert "no capacity" in table.items[("r1", "META")]["error"]
