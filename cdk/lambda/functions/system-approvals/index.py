"""Approves or rejects a waiting deploy-pipeline approval, and retries, releases or stops pipeline runs, from the
controller's System page (people only).

Only the prod controller has this function. It acts through a role in the pipelines account that can do only these
things. An approval's comment records who decided and why, so it shows in CodePipeline and in the pipeline's Slack
notifications; CodePipeline keeps no comment for a retry or a release, so those are recorded in this function's log,
and a stop carries its reason.

TODO: restrict approving to a Cognito group (e.g. devops-admins). Today anyone who can sign into the prod controller
can approve; the shared API authorizer would have to pass the token's cognito:groups in its context for this check.
"""
from __future__ import annotations

import json
import logging
import os

import boto3
from utils import create_response

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DECISIONS = {"Approved", "Rejected"}
OPERATIONS = {"retry", "release", "stop"}
RETRY_MODES = {"FAILED_ACTIONS", "ALL_ACTIONS"}
# CodePipeline keeps at most 200 characters of a stop's reason.
MAX_STOP_REASON = 200
# CodePipeline keeps at most 512 characters of an approval's summary.
MAX_SUMMARY = 512
MAX_REASON = 400


def approvals_client():
    credentials = boto3.client("sts").assume_role(
        RoleArn=os.environ["APPROVALS_ROLE_ARN"], RoleSessionName="system-approvals")["Credentials"]
    return boto3.client(
        "codepipeline",
        region_name=os.environ["PIPELINES_REGION"],
        aws_access_key_id=credentials["AccessKeyId"],
        aws_secret_access_key=credentials["SecretAccessKey"],
        aws_session_token=credentials["SessionToken"],
    )


def caller(event: dict) -> str:
    who = ((event.get("requestContext") or {}).get("authorizer") or {}).get("email")
    if not who:
        raise ValueError("couldn't tell who is signed in")
    return who


def parse(event: dict) -> tuple[dict, str]:
    """The decision asked for, and who is asking; raises ValueError for anything malformed."""
    body = json.loads(event.get("body") or "{}")
    for field in ("pipeline", "stage", "action", "token"):
        if not isinstance(body.get(field), str) or not body[field]:
            raise ValueError(f"{field} is required")
    if body.get("decision") not in DECISIONS:
        raise ValueError("decision must be Approved or Rejected")
    reason = body.get("reason")
    if not isinstance(reason, str) or not reason.strip() or len(reason) > MAX_REASON:
        raise ValueError(f"a reason of up to {MAX_REASON} characters is required")
    return body, caller(event)


def parse_operation(event: dict) -> tuple[dict, str]:
    """A retry, release or stop of the pipeline in the path, and who is asking; raises ValueError for anything
    malformed."""
    pipeline = (event.get("pathParameters") or {}).get("name")
    if not pipeline:
        raise ValueError("a pipeline name is required")
    body = json.loads(event.get("body") or "{}")
    operation = body.get("operation")
    if operation not in OPERATIONS:
        raise ValueError(f"operation must be one of {', '.join(sorted(OPERATIONS))}")
    reason = body.get("reason") or ""
    if not isinstance(reason, str) or len(reason) > MAX_REASON:
        raise ValueError(f"a reason may be up to {MAX_REASON} characters")
    request = {"pipeline": pipeline, "operation": operation, "reason": reason.strip()}
    if operation in ("retry", "stop") and (not isinstance(body.get("runId"), str) or not body["runId"]):
        raise ValueError("runId is required")
    if operation == "retry":
        if not isinstance(body.get("stage"), str) or not body["stage"]:
            raise ValueError("stage is required")
        if body.get("mode") not in RETRY_MODES:
            raise ValueError("mode must be FAILED_ACTIONS or ALL_ACTIONS")
        request.update(runId=body["runId"], stage=body["stage"], mode=body["mode"])
    if operation == "stop":
        if not request["reason"]:
            raise ValueError("a reason is required to stop a run")
        request.update(runId=body["runId"], abandon=body.get("abandon") is True)
    return request, caller(event)


def summary(decision: str, who: str, reason: str) -> str:
    return f"{decision} by {who} via the controller: {reason.strip()}"[:MAX_SUMMARY]


def operate(client, request: dict, who: str) -> dict:
    if request["operation"] == "retry":
        result = client.retry_stage_execution(
            pipelineName=request["pipeline"], stageName=request["stage"],
            pipelineExecutionId=request["runId"], retryMode=request["mode"])
        return {"runId": result["pipelineExecutionId"]}
    if request["operation"] == "release":
        return {"runId": client.start_pipeline_execution(name=request["pipeline"])["pipelineExecutionId"]}
    result = client.stop_pipeline_execution(
        pipelineName=request["pipeline"], pipelineExecutionId=request["runId"], abandon=request["abandon"],
        reason=f"Stopped by {who} via the controller: {request['reason']}"[:MAX_STOP_REASON])
    return {"runId": result["pipelineExecutionId"]}


def operation_handler(event: dict) -> dict:
    try:
        request, who = parse_operation(event)
    except ValueError as error:
        return create_response(400, {"message": str(error)})
    try:
        client = approvals_client()
    except Exception as error:  # the pipelines account refusing this Lambda's role; a deploy problem, not the user's
        return create_response(502, {"message": f"couldn't reach the pipelines account: {error}"})
    try:
        result = operate(client, request, who)
    except Exception as error:  # a stage that can't be retried, a run already finished, or AWS refusing
        return create_response(409, {"message": str(error)})
    logger.info(json.dumps({"pipelineOperation": request, "by": who, **result}))
    return create_response(200, {**result, "by": who})


def handler(event: dict, context) -> dict:
    if (event.get("resource") or "").startswith("/system/pipelines/"):
        return operation_handler(event)
    try:
        body, who = parse(event)
    except ValueError as error:
        return create_response(400, {"message": str(error)})
    try:
        client = approvals_client()
    except Exception as error:  # the pipelines account refusing this Lambda's role; a deploy problem, not the user's
        return create_response(502, {"message": f"couldn't reach the pipelines account: {error}"})
    try:
        client.put_approval_result(
            pipelineName=body["pipeline"],
            stageName=body["stage"],
            actionName=body["action"],
            token=body["token"],
            result={"status": body["decision"], "summary": summary(body["decision"], who, body["reason"])},
        )
    except Exception as error:  # an expired or already-answered approval, or AWS refusing; the page shows why
        return create_response(409, {"message": str(error)})
    return create_response(200, {"status": body["decision"], "by": who})
