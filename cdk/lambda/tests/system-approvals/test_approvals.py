import json

import pytest

import index as approvals


def event(body, email="mason@gnometrading.group"):
    authorizer = {"kind": "person", "actor": email, "email": email} if email else {}
    return {"body": json.dumps(body), "requestContext": {"authorizer": authorizer}}


GOOD = {"pipeline": "RegistryPipeline", "stage": "Prod", "action": "ApproveProd", "token": "t-1",
        "decision": "Approved", "reason": "Ledger fix verified in dev"}


def test_a_decision_records_who_made_it_and_why():
    body, who = approvals.parse(event(GOOD))
    assert who == "mason@gnometrading.group"
    assert approvals.summary(body["decision"], who, body["reason"]) == (
        "Approved by mason@gnometrading.group via the controller: Ledger fix verified in dev")
    assert len(approvals.summary("Rejected", who, "x" * 400)) <= approvals.MAX_SUMMARY


@pytest.mark.parametrize("change, message", [
    ({"decision": "Maybe"}, "decision"),
    ({"reason": "  "}, "reason"),
    ({"reason": "x" * 401}, "reason"),
    ({"token": ""}, "token"),
])
def test_malformed_requests_are_refused_before_anything_is_approved(change, message):
    with pytest.raises(ValueError, match=message):
        approvals.parse(event({**GOOD, **change}))
    with pytest.raises(ValueError, match="signed in"):
        approvals.parse(event(GOOD, email=None))


def operation(body, name="RegistryPipeline", email="mason@gnometrading.group"):
    return {**event(body, email), "resource": "/system/pipelines/{name}/operations", "pathParameters": {"name": name}}


class FakePipelines:
    def __init__(self):
        self.calls = []

    def retry_stage_execution(self, **kwargs):
        self.calls.append(("retry", kwargs))
        return {"pipelineExecutionId": kwargs["pipelineExecutionId"]}

    def start_pipeline_execution(self, **kwargs):
        self.calls.append(("start", kwargs))
        return {"pipelineExecutionId": "new-run"}

    def stop_pipeline_execution(self, **kwargs):
        self.calls.append(("stop", kwargs))
        return {"pipelineExecutionId": kwargs["pipelineExecutionId"]}


def test_retry_release_and_stop_reach_the_pipeline_named_in_the_path():
    client = FakePipelines()
    request, who = approvals.parse_operation(operation(
        {"operation": "retry", "runId": "r2", "stage": "Dev", "mode": "FAILED_ACTIONS", "pipeline": "Ignored"}))
    assert approvals.operate(client, request, who) == {"runId": "r2"}
    request, who = approvals.parse_operation(operation({"operation": "release"}))
    assert approvals.operate(client, request, who) == {"runId": "new-run"}
    request, who = approvals.parse_operation(operation({"operation": "stop", "runId": "r3", "reason": "bad commit"}))
    approvals.operate(client, request, who)
    assert client.calls == [
        ("retry", {"pipelineName": "RegistryPipeline", "stageName": "Dev", "pipelineExecutionId": "r2",
                   "retryMode": "FAILED_ACTIONS"}),
        ("start", {"name": "RegistryPipeline"}),
        ("stop", {"pipelineName": "RegistryPipeline", "pipelineExecutionId": "r3", "abandon": False,
                  "reason": "Stopped by mason@gnometrading.group via the controller: bad commit"}),
    ]


@pytest.mark.parametrize("body, message", [
    ({"operation": "deploy"}, "operation"),
    ({"operation": "retry", "stage": "Dev", "mode": "FAILED_ACTIONS"}, "runId"),
    ({"operation": "retry", "runId": "r1", "mode": "FAILED_ACTIONS"}, "stage"),
    ({"operation": "retry", "runId": "r1", "stage": "Dev", "mode": "SOME"}, "mode"),
    ({"operation": "stop", "runId": "r1"}, "reason"),
    ({"operation": "release", "reason": "x" * 401}, "reason"),
])
def test_malformed_operations_are_refused_before_anything_runs(body, message):
    with pytest.raises(ValueError, match=message):
        approvals.parse_operation(operation(body))
    with pytest.raises(ValueError, match="signed in"):
        approvals.parse_operation(operation({"operation": "release"}, email=None))


def test_an_operation_without_a_pipeline_is_refused_by_the_handler():
    response = approvals.handler({**operation({"operation": "release"}), "pathParameters": {}}, None)
    assert response["statusCode"] == 400
