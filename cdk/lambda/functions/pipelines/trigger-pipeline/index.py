"""Trigger a pipeline run: create a DynamoDB run record and start an ECS Fargate task."""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone

import boto3
from utils import create_response, DecimalEncoder

DYNAMODB_TABLE = os.environ["DYNAMODB_TABLE"]
ECS_CLUSTER_ARN = os.environ["ECS_CLUSTER_ARN"]
ECS_TASK_DEF_ARN = os.environ["ECS_TASK_DEF_ARN"]
ECS_SUBNET_IDS = os.environ["ECS_SUBNET_IDS"]
ECS_SECURITY_GROUP_ID = os.environ["ECS_SECURITY_GROUP_ID"]
_PIPELINES_PK = "__pipelines__"

_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(DYNAMODB_TABLE)
_ecs = boto3.client("ecs")



def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _run_id() -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    return f"{ts}-{uuid.uuid4().hex[:8]}"


def handler(event: dict, context) -> dict:
    pipeline_name = (event.get("pathParameters") or {})
    if not pipeline_name:
        # Also accept direct invocation from EventBridge Scheduler
        body = event if "pipeline_name" in event else json.loads(event.get("body") or "{}")
        pipeline_name_str = body.get("pipeline_name", "")
        trigger = body.get("trigger", "manual")
        params = body.get("parameters", {})
    else:
        pipeline_name_str = pipeline_name.get("pipelineName", "")
        body = json.loads(event.get("body") or "{}")
        trigger = "manual"
        params = body.get("parameters", {})

    if not pipeline_name_str:
        return create_response(400, {"error": "pipeline_name required"})

    pipeline_resp = _table.get_item(
        Key={"session_name": _PIPELINES_PK, "sk": f"PIPELINE#{pipeline_name_str}"}
    )
    pipeline_def = pipeline_resp.get("Item")
    if not pipeline_def:
        return create_response(404, {"error": f"Pipeline '{pipeline_name_str}' not found"})

    run_id = _run_id()
    sk = f"RUN#{pipeline_name_str}#{run_id}"
    merged_params = {**pipeline_def.get("parameters", {}), **params}

    run_record = {
        "session_name": _PIPELINES_PK,
        "sk": sk,
        "pipeline_name": pipeline_name_str,
        "run_id": run_id,
        "status": "PENDING",
        "trigger": trigger,
        "parameters": merged_params,
        "queued_at": _now(),
    }
    _table.put_item(Item=run_record)

    cpu = int(pipeline_def.get("cpu", 1024))
    memory = int(pipeline_def.get("memory", 4096))

    ecs_resp = _ecs.run_task(
        cluster=ECS_CLUSTER_ARN,
        taskDefinition=ECS_TASK_DEF_ARN,
        launchType="FARGATE",
        networkConfiguration={
            "awsvpcConfiguration": {
                "subnets": ECS_SUBNET_IDS.split(","),
                "securityGroups": [ECS_SECURITY_GROUP_ID],
                "assignPublicIp": "ENABLED",
            }
        },
        overrides={
            "containerOverrides": [{
                "name": "pipeline",
                "cpu": cpu,
                "memory": memory,
                "environment": [
                    {"name": "PIPELINE_NAME", "value": pipeline_name_str},
                    {"name": "RUN_ID", "value": run_id},
                    {"name": "PIPELINE_PARAMS", "value": json.dumps(merged_params, cls=DecimalEncoder)},
                ],
            }],
            "cpu": str(cpu),
            "memory": str(memory),
        },
    )

    task = ecs_resp.get("tasks", [{}])[0]
    task_arn = task.get("taskArn", "")

    _table.update_item(
        Key={"session_name": _PIPELINES_PK, "sk": sk},
        UpdateExpression="SET ecs_task_arn = :arn",
        ExpressionAttributeValues={":arn": task_arn},
    )

    return create_response(202, {"run_id": run_id, "ecs_task_arn": task_arn})
