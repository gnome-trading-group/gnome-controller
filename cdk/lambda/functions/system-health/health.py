"""What the system health page shows, decided from AWS's own descriptions of the account's resources.

Nothing here calls AWS or names a resource: the handler discovers resources and hands them over as AWS returned
them, so a new alarm, queue, job or pipeline appears without a code change.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

OTHER_SERVICE = "Other"
ALARM_STATES = ("ALARM", "INSUFFICIENT_DATA", "OK")


def service_of(alarm_name: str) -> str:
    """The service an alarm belongs to: the prefix every monitoring stack puts on its alarm names ("Registry-...")."""
    prefix, separator, _ = alarm_name.partition("-")
    return prefix if separator and prefix else OTHER_SERVICE


def _iso(value: Any) -> str | None:
    return value.isoformat() if isinstance(value, datetime) else value


def alarm_row(alarm: dict, region: str) -> dict:
    """One CloudWatch alarm (metric or composite, as describe_alarms returns it), in the page's terms."""
    return {
        "name": alarm["AlarmName"],
        "service": service_of(alarm["AlarmName"]),
        "state": alarm.get("StateValue", "INSUFFICIENT_DATA"),
        "reason": alarm.get("StateReason"),
        "since": _iso(alarm.get("StateUpdatedTimestamp")),
        "description": alarm.get("AlarmDescription"),
        "region": region,
        "actionsEnabled": alarm.get("ActionsEnabled", True),
    }


def group_alarms(rows: list[dict]) -> list[dict]:
    """Alarms by service, the services with firing alarms first; within one, firing alarms first, longest-firing
    first."""
    by_service: dict[str, list[dict]] = {}
    for row in rows:
        by_service.setdefault(row["service"], []).append(row)
    services = []
    for name, alarms in by_service.items():
        alarms.sort(key=lambda a: (ALARM_STATES.index(a["state"]) if a["state"] in ALARM_STATES else 1, a["since"] or ""))
        services.append({
            "name": name,
            "firing": sum(1 for a in alarms if a["state"] == "ALARM"),
            "insufficient": sum(1 for a in alarms if a["state"] == "INSUFFICIENT_DATA"),
            "total": len(alarms),
            "alarms": alarms,
        })
    services.sort(key=lambda s: (-s["firing"], s["name"] == OTHER_SERVICE, s["name"]))
    return services


# ---- Scheduled jobs -------------------------------------------------------------------------------------------------

_RATE_UNITS = {"minute": 60, "minutes": 60, "hour": 3600, "hours": 3600, "day": 86400, "days": 86400}
# A job counts as overdue once it has gone this many schedule intervals without running.
OVERDUE_INTERVALS = 2


def schedule_interval_seconds(expression: str | None) -> int | None:
    """How often a schedule expression fires, or None when it can't be told simply.

    rate(n unit) is exact. A cron expression is read field by field for the common shapes (every n minutes, hourly,
    daily, weekly); anything more irregular returns None and the job is never called overdue.
    """
    if not expression:
        return None
    expression = expression.strip()
    if expression.startswith("rate(") and expression.endswith(")"):
        parts = expression[5:-1].split()
        if len(parts) == 2 and parts[0].isdigit() and parts[1] in _RATE_UNITS:
            return int(parts[0]) * _RATE_UNITS[parts[1]]
        return None
    if expression.startswith("cron(") and expression.endswith(")"):
        fields = expression[5:-1].split()
        if len(fields) != 6:
            return None
        minute, hour, day_of_month, _, day_of_week, _ = fields
        if minute.startswith("*/") or minute.startswith("0/"):
            step = minute.split("/")[1]
            return int(step) * 60 if step.isdigit() else None
        if minute == "*":
            return 60
        if hour == "*":
            return 3600
        if hour.startswith("*/") or hour.startswith("0/"):
            step = hour.split("/")[1]
            return int(step) * 3600 if step.isdigit() else None
        if day_of_month in ("*", "?") and day_of_week in ("*", "?"):
            return 86400
        # Weekday-only schedules skip weekends; allow for the longest gap rather than flag every Monday.
        return 3 * 86400 if "-" in day_of_week or "," in day_of_week else 7 * 86400
    return None


def job_row(rule: dict, region: str, targets: list[dict], last_run: datetime | None, last_error: datetime | None,
            runs_24h: int | None, errors_24h: int | None, now: datetime) -> dict:
    """One scheduled EventBridge rule: when it last fired (its own metrics, whatever its targets are) and when it or
    its Lambda targets last failed. Several rules can share a Lambda, so a Lambda's errors are the function's, not
    only this rule's."""
    interval = schedule_interval_seconds(rule.get("ScheduleExpression"))
    enabled = rule.get("State") == "ENABLED"
    overdue = bool(
        enabled and interval and (last_run is None or (now - last_run).total_seconds() > OVERDUE_INTERVALS * interval))
    return {
        "name": rule["Name"],
        "description": rule.get("Description"),
        "schedule": rule.get("ScheduleExpression"),
        "intervalSeconds": interval,
        "enabled": enabled,
        "region": region,
        "targets": targets,
        "lastRun": _iso(last_run),
        "lastError": _iso(last_error),
        "runs24h": runs_24h,
        "errors24h": errors_24h,
        "overdue": overdue,
    }


def target_row(target: dict) -> dict:
    """What a rule's target is (a Lambda, whose errors count against the job, or something else, named by its ARN),
    and the input the rule sends it: rules sharing one target are told apart by it."""
    arn = target.get("Arn", "")
    service = arn.split(":")[2] if arn.count(":") >= 2 else "unknown"
    name = arn.split(":function:")[-1].split(":")[0] if service == "lambda" else arn.rsplit("/", 1)[-1].rsplit(":", 1)[-1]
    return {"type": service, "name": name, "arn": arn, "input": target.get("Input")}


def sort_jobs(rows: list[dict]) -> list[dict]:
    """Overdue first, then jobs whose last run failed, then by name."""
    def failed_last(row: dict) -> bool:
        return bool(row["lastError"] and (not row["lastRun"] or row["lastError"] >= row["lastRun"]))
    return sorted(rows, key=lambda r: (not r["overdue"], not failed_last(r), not r["enabled"], r["name"]))


# ---- Queues ---------------------------------------------------------------------------------------------------------

def dead_letter_arns(queues: list[dict]) -> set[str]:
    """The queues other queues send their failed messages to, from those queues' redrive policies."""
    arns = set()
    for queue in queues:
        policy = queue.get("attributes", {}).get("RedrivePolicy")
        if not policy:
            continue
        try:
            target = json.loads(policy).get("deadLetterTargetArn")
        except (TypeError, ValueError):
            continue
        if target:
            arns.add(target)
    return arns


def queue_rows(queues: list[dict]) -> list[dict]:
    """Every queue, dead-letter queues holding messages first, then by how much is waiting."""
    dead = dead_letter_arns(queues)
    rows = []
    for queue in queues:
        attributes = queue.get("attributes", {})
        arn = attributes.get("QueueArn", "")
        rows.append({
            "name": arn.rsplit(":", 1)[-1] or queue["url"].rsplit("/", 1)[-1],
            "region": queue["region"],
            "deadLetter": arn in dead,
            "visible": int(attributes.get("ApproximateNumberOfMessages", 0)),
            "inFlight": int(attributes.get("ApproximateNumberOfMessagesNotVisible", 0)),
            "oldestAgeSeconds": queue.get("oldestAgeSeconds"),
        })
    return sorted(rows, key=lambda r: (not (r["deadLetter"] and r["visible"] > 0), -r["visible"], r["name"]))


# ---- Database -------------------------------------------------------------------------------------------------------

GIB = 1024 ** 3
DAY = 86400


def storage_projection(capacity_gib: float, allocated_gib: float, free_bytes: list[tuple[datetime, float]]) -> dict:
    """How full storage is and, from the trend in free space, roughly when it reaches capacity (the autoscaling
    maximum, else what's allocated). Free space jumping up (autoscaling added storage, or space was reclaimed) starts
    the trend afresh, so only steady growth since then is extrapolated."""
    if not free_bytes:
        return {"usedGiB": None, "capacityGiB": capacity_gib, "growthGiBPerDay": None, "daysUntilFull": None}
    points = sorted(free_bytes)
    start = 0
    for i in range(1, len(points)):
        if points[i][1] > points[i - 1][1] + GIB:
            start = i
    window = points[start:]
    used = [(t, allocated_gib - free / GIB) for t, free in window]
    current = used[-1][1]
    growth = None
    days = None
    if len(used) >= 2:
        span_days = (used[-1][0] - used[0][0]).total_seconds() / DAY
        if span_days >= 1:
            # Least squares over the window, in GiB per day.
            xs = [(t - used[0][0]).total_seconds() / DAY for t, _ in used]
            ys = [u for _, u in used]
            mean_x = sum(xs) / len(xs)
            mean_y = sum(ys) / len(ys)
            spread = sum((x - mean_x) ** 2 for x in xs)
            growth = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / spread if spread else None
            if growth and growth > 0:
                days = max(0.0, (capacity_gib - current) / growth)
    return {"usedGiB": round(current, 2), "capacityGiB": capacity_gib,
            "growthGiBPerDay": round(growth, 4) if growth is not None else None,
            "daysUntilFull": round(days, 1) if days is not None else None}


# ---- Pipelines ------------------------------------------------------------------------------------------------------

def pipeline_row(name: str, region: str, structure: dict, state: dict, latest: dict | None, now: datetime) -> dict:
    """A pipeline's latest run, each stage's state, and approvals that are waiting on someone."""
    approvals = {
        (stage["name"], action["name"])
        for stage in structure.get("stages", [])
        for action in stage.get("actions", [])
        if action.get("actionTypeId", {}).get("category") == "Approval"
    }
    stages = []
    waiting = []
    for stage in state.get("stageStates", []):
        execution = stage.get("latestExecution", {})
        stages.append({"name": stage["stageName"], "status": execution.get("status"),
                       "executionId": execution.get("pipelineExecutionId")})
        for action in stage.get("actionStates", []):
            run = action.get("latestExecution", {})
            if (stage["stageName"], action["actionName"]) in approvals and run.get("status") == "InProgress":
                since = run.get("lastStatusChange")
                execution_id = execution.get("pipelineExecutionId")
                earlier = stages[:-1]
                waiting.append({
                    "stage": stage["stageName"],
                    "action": action["actionName"],
                    "since": _iso(since),
                    "waitingSeconds": (now - since).total_seconds() if isinstance(since, datetime) else None,
                    # Approving needs the token of this wait; the run it belongs to is what would ship.
                    "token": run.get("token"),
                    "executionId": execution_id,
                    # Without its run's id there's no telling which run the earlier stages passed.
                    "earlierStagesPassed": execution_id is not None and all(
                        s["status"] == "Succeeded" and s["executionId"] == execution_id for s in earlier),
                    "revisions": [],
                })
    failed = next((s["name"] for s in stages if s["status"] == "Failed"), None)
    return {
        "name": name,
        "region": region,
        "status": latest.get("status") if latest else None,
        "startedAt": _iso(latest.get("startTime")) if latest else None,
        "updatedAt": _iso(latest.get("lastUpdateTime")) if latest else None,
        "stages": stages,
        "failedStage": failed,
        "waitingApprovals": waiting,
    }


def revisions(execution: dict) -> list[dict]:
    """What a pipeline run would ship: each source's commit, with its message when the source gives one (GitHub
    sources put it in a JSON summary)."""
    rows = []
    for revision in execution.get("artifactRevisions", []):
        summary = revision.get("revisionSummary") or ""
        message = summary
        try:
            parsed = json.loads(summary)
            if isinstance(parsed, dict):
                message = parsed.get("CommitMessage", summary)
        except ValueError:
            pass
        rows.append({"source": revision.get("name"), "revision": revision.get("revisionId"),
                     "message": message.strip() or None, "url": revision.get("revisionUrl")})
    return rows


def sort_pipelines(rows: list[dict]) -> list[dict]:
    """Failed first, then those waiting on an approval, then by name."""
    return sorted(rows, key=lambda r: (r["failedStage"] is None and r["status"] != "Failed", not r["waitingApprovals"], r["name"]))


# ---- Fleet ----------------------------------------------------------------------------------------------------------

def fleet_row(instance: dict, region: str, status: dict | None, cpu: float | None, image: dict | None,
              now: datetime) -> dict:
    """A tagged instance with its health checks, CPU and how old its machine image is."""
    tags = {t["Key"]: t["Value"] for t in instance.get("Tags", [])}
    created = image.get("CreationDate") if image else None
    image_age_days = None
    if created:
        image_age_days = round((now - datetime.fromisoformat(created.replace("Z", "+00:00"))).total_seconds() / DAY, 1)
    checks = None
    if status:
        system = status.get("SystemStatus", {}).get("Status")
        own = status.get("InstanceStatus", {}).get("Status")
        checks = "ok" if system == "ok" and own == "ok" else (system if system != "ok" else own)
    return {
        "instanceId": instance["InstanceId"],
        "region": region,
        "state": instance.get("State", {}).get("Name"),
        "type": instance.get("InstanceType"),
        "launchedAt": _iso(instance.get("LaunchTime")),
        "purpose": tags.get("gnome:purpose"),
        "sessionId": tags.get("gnome:session-id"),
        "strategyId": tags.get("gnome:strategy-id"),
        "checks": checks,
        "cpuPercent": round(cpu, 1) if cpu is not None else None,
        "imageName": image.get("Name") if image else None,
        "imageAgeDays": image_age_days,
    }
