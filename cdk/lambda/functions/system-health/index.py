"""The system health page's data, one section per request (Cognito-authenticated, UI only).

Every section discovers what exists in the account, across every region enabled for it, and reads only; see
health.py for what it makes of it. Results are cached briefly per section, so the page polling every minute costs a
few hundred cheap read calls at most.
"""
from __future__ import annotations

import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Callable

import boto3
from utils import create_response

import health

CACHE_SECONDS = 60
REGION_CACHE_SECONDS = 3600
# Regions are scanned at once; each scan makes a handful of calls.
MAX_WORKERS = 16

_cache: dict[str, tuple[float, dict]] = {}
_regions: tuple[float, list[str]] | None = None


def enabled_regions() -> list[str]:
    """Every region the account can use, so resources in a new region appear without configuration."""
    global _regions
    if _regions and time.time() - _regions[0] < REGION_CACHE_SECONDS:
        return _regions[1]
    response = boto3.client("ec2").describe_regions(
        Filters=[{"Name": "opt-in-status", "Values": ["opt-in-not-required", "opted-in"]}])
    regions = sorted(r["RegionName"] for r in response["Regions"])
    _regions = (time.time(), regions)
    return regions


def across_regions(scan: Callable[[str], list]) -> tuple[list, list[dict]]:
    """Runs a scan in every region; a region that fails is reported rather than failing the section."""
    regions = enabled_regions()
    results: list = []
    errors: list[dict] = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {region: pool.submit(scan, region) for region in regions}
        for region, future in futures.items():
            try:
                results.extend(future.result())
            except Exception as error:  # one unreachable region mustn't hide the others
                errors.append({"region": region, "message": str(error)})
    return results, errors


def scan_alarms(region: str) -> list[dict]:
    paginator = boto3.client("cloudwatch", region_name=region).get_paginator("describe_alarms")
    rows = []
    for page in paginator.paginate(AlarmTypes=["MetricAlarm", "CompositeAlarm"]):
        for alarm in page.get("MetricAlarms", []) + page.get("CompositeAlarms", []):
            rows.append(health.alarm_row(alarm, region))
    return rows


def alarms_section() -> dict:
    rows, errors = across_regions(scan_alarms)
    return {"services": health.group_alarms(rows), "errors": errors}


def metric_series(client, queries: list[dict], start: datetime, end: datetime) -> dict[str, list[tuple[datetime, float]]]:
    """GetMetricData for a batch of queries, each a dict of id, namespace, metric, dimensions, stat and period, as
    oldest-first (time, value) lists by id."""
    if not queries:
        return {}
    series: dict[str, list[tuple[datetime, float]]] = {q["id"]: [] for q in queries}
    paginator = client.get_paginator("get_metric_data")
    for page in paginator.paginate(
        StartTime=start,
        EndTime=end,
        MetricDataQueries=[{
            "Id": q["id"],
            "MetricStat": {
                "Metric": {"Namespace": q["namespace"], "MetricName": q["metric"],
                           "Dimensions": [{"Name": k, "Value": v} for k, v in q["dimensions"].items()]},
                "Period": q["period"],
                "Stat": q["stat"],
            },
        } for q in queries],
    ):
        for result in page["MetricDataResults"]:
            series[result["Id"]].extend(zip(result["Timestamps"], result["Values"]))
    return {key: sorted(values) for key, values in series.items()}


def as_points(values: list[tuple[datetime, float]]) -> dict:
    return {"t": [int(t.timestamp() * 1000) for t, _ in values], "v": [v for _, v in values]}


# ---- Scheduled jobs --------------------------------------------------------------------------------------------------

# How far back to look for a job's runs: a few of its intervals, within CloudWatch's fine-grained retention.
MIN_JOB_WINDOW = timedelta(days=1)
MAX_JOB_WINDOW = timedelta(days=15)


def scan_jobs(region: str) -> list[dict]:
    events = boto3.client("events", region_name=region)
    cloudwatch = boto3.client("cloudwatch", region_name=region)
    now = datetime.now(timezone.utc)
    rows = []
    for page in events.get_paginator("list_rules").paginate():
        for rule in page["Rules"]:
            if not rule.get("ScheduleExpression"):
                continue
            targets = [health.target_row(t) for t in
                       events.list_targets_by_rule(Rule=rule["Name"], EventBusName=rule.get("EventBusName", "default"))["Targets"]]
            interval = health.schedule_interval_seconds(rule["ScheduleExpression"]) or 3600
            window = min(MAX_JOB_WINDOW, max(MIN_JOB_WINDOW, timedelta(seconds=3 * interval)))
            period = 300 if window <= timedelta(days=3) else 3600
            queries = [
                {"id": "fired", "namespace": "AWS/Events", "metric": "Invocations",
                 "dimensions": {"RuleName": rule["Name"]}, "stat": "Sum", "period": period},
                {"id": "undelivered", "namespace": "AWS/Events", "metric": "FailedInvocations",
                 "dimensions": {"RuleName": rule["Name"]}, "stat": "Sum", "period": period},
            ] + [
                {"id": f"errors{i}", "namespace": "AWS/Lambda", "metric": "Errors",
                 "dimensions": {"FunctionName": t["name"]}, "stat": "Sum", "period": period}
                for i, t in enumerate(targets) if t["type"] == "lambda"
            ]
            series = metric_series(cloudwatch, queries, now - window, now)
            day_ago = now - timedelta(days=1)
            last_run = max((t for t, v in series["fired"] if v > 0), default=None)
            runs = int(sum(v for t, v in series["fired"] if t >= day_ago))
            failures = [values for key, values in series.items() if key != "fired"]
            last_error = max((t for values in failures for t, v in values if v > 0), default=None)
            errors = int(sum(v for values in failures for t, v in values if t >= day_ago))
            rows.append(health.job_row(rule, region, targets, last_run, last_error, runs, errors, now))
    return rows


def jobs_section() -> dict:
    rows, errors = across_regions(scan_jobs)
    return {"jobs": health.sort_jobs(rows), "errors": errors}


# ---- Queues -----------------------------------------------------------------------------------------------------------

def scan_queues(region: str) -> list[dict]:
    sqs = boto3.client("sqs", region_name=region)
    queues = []
    for page in sqs.get_paginator("list_queues").paginate():
        for url in page.get("QueueUrls", []):
            attributes = sqs.get_queue_attributes(QueueUrl=url, AttributeNames=["All"])["Attributes"]
            queues.append({"url": url, "region": region, "attributes": attributes})
    if queues:
        now = datetime.now(timezone.utc)
        series = metric_series(boto3.client("cloudwatch", region_name=region), [
            {"id": f"q{i}", "namespace": "AWS/SQS", "metric": "ApproximateAgeOfOldestMessage",
             "dimensions": {"QueueName": q["url"].rsplit("/", 1)[-1]}, "stat": "Maximum", "period": 300}
            for i, q in enumerate(queues)
        ], now - timedelta(minutes=30), now)
        for i, queue in enumerate(queues):
            values = series.get(f"q{i}", [])
            queue["oldestAgeSeconds"] = values[-1][1] if values else None
    return queues


def queues_section() -> dict:
    queues, errors = across_regions(scan_queues)
    return {"queues": health.queue_rows(queues), "errors": errors}


# ---- Database ---------------------------------------------------------------------------------------------------------

DB_METRICS = [
    ("cpu", "CPUUtilization", "Average"),
    ("memory", "FreeableMemory", "Minimum"),
    ("connections", "DatabaseConnections", "Maximum"),
    ("readLatency", "ReadLatency", "Average"),
    ("writeLatency", "WriteLatency", "Average"),
]
STORAGE_TREND = timedelta(days=14)


def scan_databases(region: str) -> list[dict]:
    rds = boto3.client("rds", region_name=region)
    cloudwatch = boto3.client("cloudwatch", region_name=region)
    now = datetime.now(timezone.utc)
    rows = []
    for page in rds.get_paginator("describe_db_instances").paginate():
        for db in page["DBInstances"]:
            dims = {"DBInstanceIdentifier": db["DBInstanceIdentifier"]}
            recent = metric_series(cloudwatch, [
                {"id": key.lower(), "namespace": "AWS/RDS", "metric": metric, "dimensions": dims, "stat": stat, "period": 300}
                for key, metric, stat in DB_METRICS
            ], now - timedelta(days=1), now)
            storage = metric_series(cloudwatch, [
                {"id": "free", "namespace": "AWS/RDS", "metric": "FreeStorageSpace", "dimensions": dims,
                 "stat": "Minimum", "period": 3600},
            ], now - STORAGE_TREND, now)["free"]
            allocated = db.get("AllocatedStorage", 0)
            rows.append({
                "identifier": db["DBInstanceIdentifier"],
                "region": region,
                "engine": f"{db.get('Engine')} {db.get('EngineVersion', '')}".strip(),
                "instanceClass": db.get("DBInstanceClass"),
                "status": db.get("DBInstanceStatus"),
                "multiAz": db.get("MultiAZ", False),
                "allocatedGiB": allocated,
                "maxAllocatedGiB": db.get("MaxAllocatedStorage"),
                "storage": health.storage_projection(db.get("MaxAllocatedStorage") or allocated, allocated, storage),
                "metrics": {key: as_points(recent.get(key.lower(), [])) for key, _, _ in DB_METRICS},
            })
    return rows


def database_section() -> dict:
    rows, errors = across_regions(scan_databases)
    return {"databases": rows, "errors": errors}


# ---- Pipelines --------------------------------------------------------------------------------------------------------

def read_pipelines(codepipeline, region: str) -> list[dict]:
    now = datetime.now(timezone.utc)
    rows = []
    for page in codepipeline.get_paginator("list_pipelines").paginate():
        for summary in page["pipelines"]:
            name = summary["name"]
            structure = codepipeline.get_pipeline(name=name)["pipeline"]
            state = codepipeline.get_pipeline_state(name=name)
            executions = codepipeline.list_pipeline_executions(pipelineName=name, maxResults=1)["pipelineExecutionSummaries"]
            row = health.pipeline_row(name, region, structure, state, executions[0] if executions else None, now)
            for waiting in row["waitingApprovals"]:
                if waiting["executionId"]:
                    execution = codepipeline.get_pipeline_execution(
                        pipelineName=name, pipelineExecutionId=waiting["executionId"])["pipelineExecution"]
                    waiting["revisions"] = health.revisions(execution)
            rows.append(row)
    return rows


def pipelines_client():
    """CodePipeline in the account the deploy pipelines live in, through its read-only role for this page."""
    credentials = boto3.client("sts").assume_role(
        RoleArn=os.environ["PIPELINES_READ_ROLE_ARN"], RoleSessionName="system-health")["Credentials"]
    return boto3.client(
        "codepipeline",
        region_name=os.environ["PIPELINES_REGION"],
        aws_access_key_id=credentials["AccessKeyId"],
        aws_secret_access_key=credentials["SecretAccessKey"],
        aws_session_token=credentials["SessionToken"],
    )


def pipelines_section() -> dict:
    # Only the prod controller can approve; elsewhere the page shows approvals without the buttons.
    can_approve = os.environ.get("APPROVALS_ENABLED") == "true"
    # Without the role (a local run), the account's own pipelines, in every region.
    if not os.environ.get("PIPELINES_READ_ROLE_ARN"):
        rows, errors = across_regions(lambda region: read_pipelines(boto3.client("codepipeline", region_name=region), region))
        return {"pipelines": health.sort_pipelines(rows), "errors": errors, "canApprove": can_approve}
    return {"pipelines": health.sort_pipelines(read_pipelines(pipelines_client(), os.environ["PIPELINES_REGION"])),
            "errors": [], "canApprove": can_approve}


# ---- Fleet ------------------------------------------------------------------------------------------------------------

# Every instance the platform tags with what it's for (the session launcher tags each session's instance).
PURPOSE_TAG = "gnome:purpose"
LIVE_STATES = ["pending", "running", "stopping", "stopped", "shutting-down"]


def scan_fleet(region: str) -> list[dict]:
    ec2 = boto3.client("ec2", region_name=region)
    instances = [
        instance
        for page in ec2.get_paginator("describe_instances").paginate(Filters=[
            {"Name": "tag-key", "Values": [PURPOSE_TAG]},
            {"Name": "instance-state-name", "Values": LIVE_STATES},
        ])
        for reservation in page["Reservations"]
        for instance in reservation["Instances"]
    ]
    if not instances:
        return []
    ids = [i["InstanceId"] for i in instances]
    statuses = {
        s["InstanceId"]: s
        for page in ec2.get_paginator("describe_instance_status").paginate(InstanceIds=ids, IncludeAllInstances=True)
        for s in page["InstanceStatuses"]
    }
    images = {i["ImageId"]: i for i in ec2.describe_images(ImageIds=list({i["ImageId"] for i in instances}))["Images"]}
    now = datetime.now(timezone.utc)
    cpu = metric_series(boto3.client("cloudwatch", region_name=region), [
        {"id": f"c{n}", "namespace": "AWS/EC2", "metric": "CPUUtilization", "dimensions": {"InstanceId": iid},
         "stat": "Average", "period": 300}
        for n, iid in enumerate(ids)
    ], now - timedelta(minutes=30), now)
    return [
        health.fleet_row(instance, region, statuses.get(instance["InstanceId"]),
                         (cpu.get(f"c{n}") or [(None, None)])[-1][1], images.get(instance["ImageId"]), now)
        for n, instance in enumerate(instances)
    ]


def fleet_section() -> dict:
    rows, errors = across_regions(scan_fleet)
    return {"instances": sorted(rows, key=lambda r: (r["checks"] in (None, "ok"), r["purpose"] or "", r["launchedAt"] or "")),
            "errors": errors}


SECTIONS: dict[str, Callable[[], dict]] = {
    "alarms": alarms_section,
    "jobs": jobs_section,
    "queues": queues_section,
    "database": database_section,
    "pipelines": pipelines_section,
    "fleet": fleet_section,
}


def handler(event: dict, context) -> dict:
    params = event.get("queryStringParameters") or {}
    section = params.get("section")
    build = SECTIONS.get(section or "")
    if build is None:
        return create_response(400, {"message": f"section must be one of {', '.join(SECTIONS)}"})
    cached = _cache.get(section)
    # The page asks for a fresh read after it changes something (an approval), rather than wait out the cache.
    if cached and time.time() - cached[0] < CACHE_SECONDS and params.get("fresh") != "true":
        return create_response(200, cached[1])
    try:
        payload = {"section": section, "asOf": datetime.now(timezone.utc).isoformat(), **build()}
    except Exception as error:  # the page shows the section as unavailable
        return create_response(500, {"message": str(error)})
    _cache[section] = (time.time(), payload)
    return create_response(200, payload)
