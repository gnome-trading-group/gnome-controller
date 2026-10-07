"""Approves or rejects a waiting deploy-pipeline approval from the controller's System page (Cognito-authenticated).

Only the prod controller has this function. The decision is made through a role in the pipelines account that can
do nothing else, and the approval's comment records who decided and why, so it shows in CodePipeline and in the
pipeline's Slack notifications.

TODO: restrict approving to a Cognito group (e.g. devops-admins). Today anyone who can sign into the prod controller
can approve; check event["requestContext"]["authorizer"]["claims"]["cognito:groups"] here once the group exists.
"""
from __future__ import annotations

import json
import os

import boto3
from utils import create_response

DECISIONS = {"Approved", "Rejected"}
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
    claims = (event.get("requestContext") or {}).get("authorizer", {}).get("claims", {})
    who = claims.get("email") or claims.get("cognito:username")
    if not who:
        raise ValueError("couldn't tell who is signed in")
    return body, who


def summary(decision: str, who: str, reason: str) -> str:
    return f"{decision} by {who} via the controller: {reason.strip()}"[:MAX_SUMMARY]


def handler(event: dict, context) -> dict:
    try:
        body, who = parse(event)
    except ValueError as error:
        return create_response(400, {"message": str(error)})
    try:
        approvals_client().put_approval_result(
            pipelineName=body["pipeline"],
            stageName=body["stage"],
            actionName=body["action"],
            token=body["token"],
            result={"status": body["decision"], "summary": summary(body["decision"], who, body["reason"])},
        )
    except Exception as error:  # an expired or already-answered approval, or AWS refusing; the page shows why
        return create_response(409, {"message": str(error)})
    return create_response(200, {"status": body["decision"], "by": who})
