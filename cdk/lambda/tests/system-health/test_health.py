import json
from datetime import datetime, timedelta, timezone

import health


def alarm(name, state="OK", since=datetime(2026, 10, 7, 12, tzinfo=timezone.utc), **extra):
    return {"AlarmName": name, "StateValue": state, "StateReason": f"{name} is {state}", "StateUpdatedTimestamp": since, **extra}


def test_an_alarm_belongs_to_the_service_its_name_starts_with():
    assert health.service_of("Registry-RegistryApi-FaultCount") == "Registry"
    assert health.service_of("MarketData-Collector-NoData") == "MarketData"
    assert health.service_of("cpu-high") == "cpu"
    assert health.service_of("standalone") == health.OTHER_SERVICE
    assert health.service_of("-leading") == health.OTHER_SERVICE


def test_scaling_policy_alarms_are_not_shown():
    assert not health.is_shown(alarm("TargetTracking-Dev-CollectionRegionalStack-us-east-1-SpotHostsASG-AlarmLow-3aae", "ALARM"))
    assert health.is_shown(alarm("MarketData--ReconcilerLambda-Fault-Count-Error", "ALARM"))


def test_services_with_firing_alarms_come_first_and_list_their_longest_firing_alarm_first():
    early = datetime(2026, 10, 7, 9, tzinfo=timezone.utc)
    rows = [health.alarm_row(a, "us-east-1") for a in [
        alarm("Registry-Api-Latency"),
        alarm("MarketData-Gaps", "ALARM"),
        alarm("MarketData-Collector-NoData", "ALARM", since=early),
        alarm("MarketData-Queue-Age", "INSUFFICIENT_DATA"),
        alarm("orphan"),
    ]]
    services = health.group_alarms(rows)
    assert [(s["name"], s["firing"], s["insufficient"], s["total"]) for s in services] == [
        ("MarketData", 2, 1, 3), ("Registry", 0, 0, 1), (health.OTHER_SERVICE, 0, 0, 1),
    ]
    assert [a["name"] for a in services[0]["alarms"]] == [
        "MarketData-Collector-NoData", "MarketData-Gaps", "MarketData-Queue-Age",
    ]
    assert services[0]["alarms"][0]["since"] == "2026-10-07T09:00:00+00:00"
    assert services[0]["alarms"][0]["region"] == "us-east-1"


NOW = datetime(2026, 10, 7, 12, tzinfo=timezone.utc)


def test_schedule_intervals_from_rate_and_common_cron_shapes():
    assert health.schedule_interval_seconds("rate(5 minutes)") == 300
    assert health.schedule_interval_seconds("rate(1 hour)") == 3600
    assert health.schedule_interval_seconds("cron(0/15 * * * ? *)") == 900
    assert health.schedule_interval_seconds("cron(30 * * * ? *)") == 3600
    assert health.schedule_interval_seconds("cron(0 6 * * ? *)") == 86400
    assert health.schedule_interval_seconds("cron(0 6 ? * MON-FRI *)") == 3 * 86400
    assert health.schedule_interval_seconds("cron(0 6 ? * MON *)") == 7 * 86400
    assert health.schedule_interval_seconds("rate(soon)") is None
    assert health.schedule_interval_seconds(None) is None


def test_a_job_is_overdue_after_two_missed_intervals_unless_disabled_or_unmeasurable():
    lam = [health.target_row({"Arn": "arn:aws:lambda:us-east-1:1:function:sync"})]
    rule = {"Name": "sync", "ScheduleExpression": "rate(1 hour)", "State": "ENABLED"}
    def row(last_run, rule=rule, targets=lam):
        return health.job_row(rule, "us-east-1", targets, last_run, None, 0, 0, NOW)
    assert not row(datetime(2026, 10, 7, 10, 30, tzinfo=timezone.utc))["overdue"]
    assert row(datetime(2026, 10, 7, 9, 30, tzinfo=timezone.utc))["overdue"]
    assert row(None)["overdue"]
    assert not row(None, rule={**rule, "State": "DISABLED"})["overdue"]
    step = [health.target_row({"Arn": "arn:aws:states:us-east-1:1:stateMachine:merge"})]
    assert step[0] == {"type": "states", "name": "merge", "arn": "arn:aws:states:us-east-1:1:stateMachine:merge", "input": None}
    shared = health.target_row({"Arn": "arn:aws:lambda:us-east-1:1:function:transform", "Input": '{"schemaType":"mbp-1"}'})
    assert (shared["type"], shared["name"], shared["input"]) == ("lambda", "transform", '{"schemaType":"mbp-1"}')
    assert row(None, targets=step)["overdue"], "a rule's own metrics say whether it fired, whatever it targets"


def test_a_minutely_job_is_not_overdue_just_because_its_metrics_lag():
    rule = {"Name": "AlertTickRule", "ScheduleExpression": "rate(1 minute)", "State": "ENABLED"}

    def row(minutes_ago, period):
        return health.job_row(rule, "us-east-1", [], NOW - timedelta(minutes=minutes_ago), None, 0, 0, NOW, period)

    assert not row(4, 60)["overdue"], "a minute's period, still being reported"
    assert not row(7, 300)["overdue"], "the start of a five-minute period"
    assert row(7, 60)["overdue"], "two missed runs past the delay"


def test_jobs_list_overdue_then_failing_then_the_rest():
    def job(name, overdue=False, last_run=None, last_error=None, enabled=True):
        return {"name": name, "overdue": overdue, "lastRun": last_run, "lastError": last_error, "enabled": enabled}
    rows = [job("a"), job("b", last_run="2026-10-07T10:00", last_error="2026-10-07T11:00"), job("c", overdue=True),
            job("d", enabled=False)]
    assert [r["name"] for r in health.sort_jobs(rows)] == ["c", "b", "a", "d"]


def test_dead_letter_queues_are_told_by_redrive_policies_not_names():
    queues = [
        {"url": "https://q/work", "region": "us-east-1", "attributes": {
            "QueueArn": "arn:aws:sqs:us-east-1:1:work", "ApproximateNumberOfMessages": "3",
            "RedrivePolicy": '{"deadLetterTargetArn": "arn:aws:sqs:us-east-1:1:spare", "maxReceiveCount": 5}'}},
        {"url": "https://q/spare", "region": "us-east-1", "attributes": {
            "QueueArn": "arn:aws:sqs:us-east-1:1:spare", "ApproximateNumberOfMessages": "1"}},
        {"url": "https://q/busy-dlq", "region": "us-east-1", "attributes": {
            "QueueArn": "arn:aws:sqs:us-east-1:1:busy-dlq", "ApproximateNumberOfMessages": "9"}},
    ]
    rows = health.queue_rows(queues)
    assert [(r["name"], r["deadLetter"], r["visible"]) for r in rows] == [
        ("spare", True, 1), ("busy-dlq", False, 9), ("work", False, 3),
    ]


def test_storage_projection_extrapolates_steady_growth_and_restarts_after_storage_is_added():
    day = lambda d: datetime(2026, 10, d, tzinfo=timezone.utc)
    # 20 GiB allocated: free space falls 1 GiB a day, 10 GiB free now; capacity (the autoscaling maximum) is 40 GiB.
    steady = [(day(1), 15 * health.GIB), (day(3), 13 * health.GIB), (day(6), 10 * health.GIB)]
    projection = health.storage_projection(40, 20, steady)
    assert projection == {"usedGiB": 10.0, "capacityGiB": 40, "growthGiBPerDay": 1.0, "daysUntilFull": 30.0}
    # Autoscaling added 10 GiB on the 4th: free space jumped, and only the growth since then counts.
    grown = [(day(1), 15 * health.GIB), (day(3), 13 * health.GIB), (day(4), 22 * health.GIB), (day(6), 20 * health.GIB)]
    assert health.storage_projection(40, 30, grown)["growthGiBPerDay"] == 1.0
    assert health.storage_projection(40, 20, [])["usedGiB"] is None


def test_a_pipeline_reports_its_failed_stage_and_approvals_waiting_on_someone():
    structure = {"stages": [
        {"name": "Build", "actions": [{"name": "Synth", "actionTypeId": {"category": "Build"}}]},
        {"name": "Prod", "actions": [{"name": "ApproveProd", "actionTypeId": {"category": "Approval"}},
                                     {"name": "Deploy", "actionTypeId": {"category": "Deploy"}}]},
    ]}
    state = {"stageStates": [
        {"stageName": "Build", "latestExecution": {"status": "Succeeded"}, "actionStates": []},
        {"stageName": "Prod", "latestExecution": {"status": "InProgress"}, "actionStates": [
            {"actionName": "ApproveProd", "latestExecution": {"status": "InProgress",
                                                              "lastStatusChange": datetime(2026, 10, 7, 9, tzinfo=timezone.utc)}},
            {"actionName": "Deploy", "latestExecution": {"status": "InProgress"}},
        ]},
    ]}
    row = health.pipeline_row("registry", "us-east-1", structure, state, {"status": "InProgress", "pipelineExecutionId": "r9"}, NOW)
    assert row["runId"] == "r9"
    assert row["waitingApprovals"] == [{"stage": "Prod", "action": "ApproveProd", "since": "2026-10-07T09:00:00+00:00",
                                        "waitingSeconds": 3 * 3600, "token": None, "executionId": None,
                                        "earlierStagesPassed": False, "revisions": []}]
    assert row["failedStage"] is None
    failed = health.pipeline_row("ctl", "us-east-1", structure, {"stageStates": [
        {"stageName": "Build", "latestExecution": {"status": "Failed"}, "actionStates": []}]}, {"status": "Failed"}, NOW)
    assert failed["failedStage"] == "Build"
    assert [p["name"] for p in health.sort_pipelines([row, {**row, "name": "a", "waitingApprovals": []}, failed])] == [
        "ctl", "registry", "a"]


def test_a_session_instance_reads_its_tags_checks_and_image_age():
    instance = {"InstanceId": "i-1", "State": {"Name": "running"}, "InstanceType": "c7i.large",
                "Tags": [{"Key": "gnome:purpose", "Value": "strategy-session"}, {"Key": "gnome:session-id", "Value": "s1"},
                         {"Key": "gnome:strategy-id", "Value": "5"}]}
    status = {"SystemStatus": {"Status": "ok"}, "InstanceStatus": {"Status": "impaired"}}
    image = {"Name": "gnome-orchestrator-1.14", "CreationDate": "2026-09-27T12:00:00.000Z"}
    row = health.fleet_row(instance, "ap-northeast-1", status, 12.345, image, NOW)
    assert (row["sessionId"], row["strategyId"], row["checks"], row["cpuPercent"], row["imageAgeDays"]) == (
        "s1", "5", "impaired", 12.3, 10.0)
    assert health.fleet_row(instance, "ap-northeast-1", None, None, None, NOW)["checks"] is None


def test_an_approval_knows_its_run_whether_earlier_stages_passed_and_what_it_would_ship():
    structure = {"stages": [{"name": "Dev", "actions": []},
                            {"name": "Prod", "actions": [{"name": "ApproveProd", "actionTypeId": {"category": "Approval"}}]}]}
    def state(dev_run):
        return {"stageStates": [
            {"stageName": "Dev", "latestExecution": {"status": "Succeeded", "pipelineExecutionId": dev_run}, "actionStates": []},
            {"stageName": "Prod", "latestExecution": {"status": "InProgress", "pipelineExecutionId": "run-2"}, "actionStates": [
                {"actionName": "ApproveProd", "latestExecution": {"status": "InProgress", "token": "tok"}}]},
        ]}
    waiting = health.pipeline_row("p", "us-east-1", structure, state("run-2"), None, NOW)["waitingApprovals"][0]
    assert (waiting["token"], waiting["executionId"], waiting["earlierStagesPassed"]) == ("tok", "run-2", True)
    # Dev's latest success was a different run: this one hasn't been through it.
    assert not health.pipeline_row("p", "us-east-1", structure, state("run-1"), None, NOW)["waitingApprovals"][0]["earlierStagesPassed"]

    execution = {"artifactRevisions": [
        {"name": "Source", "revisionId": "abc123", "revisionUrl": "https://github.com/x/commit/abc123",
         "revisionSummary": json.dumps({"ProviderType": "GitHub", "CommitMessage": "fix: ledger fills tab\n"})},
        {"name": "Plain", "revisionId": "def", "revisionSummary": "just text"},
    ]}
    assert health.revisions(execution) == [
        {"source": "Source", "revision": "abc123", "message": "fix: ledger fills tab", "url": "https://github.com/x/commit/abc123"},
        {"source": "Plain", "revision": "def", "message": "just text", "url": None},
    ]


def test_a_failed_pipeline_names_the_action_that_failed_and_why():
    state = {"stageStates": [
        {"stageName": "Build", "latestExecution": {"status": "Failed"}, "actionStates": [
            {"actionName": "Synth", "latestExecution": {"status": "Succeeded"}},
            {"actionName": "Tests", "latestExecution": {"status": "Failed", "errorDetails": {"message": "3 tests failed"}}},
        ]}]}
    row = health.pipeline_row("ctl", "us-east-1", {"stages": []}, state, {"status": "Failed"}, NOW)
    assert row["failedAction"] == {"stage": "Build", "action": "Tests", "message": "3 tests failed"}
    assert health.pipeline_row("ctl", "us-east-1", {"stages": []}, {"stageStates": []}, None, NOW)["failedAction"] is None


T0 = datetime(2026, 11, 20, 9, tzinfo=timezone.utc)


def action_execution(stage, action, run, status="Succeeded", minutes=0, provider="CloudFormation", result=None):
    return {"stageName": stage, "actionName": action, "pipelineExecutionId": run, "status": status,
            "startTime": T0 + timedelta(minutes=minutes), "lastUpdateTime": T0 + timedelta(minutes=minutes + 2),
            "input": {"actionTypeId": {"category": "Build" if provider == "CodeBuild" else "Deploy", "provider": provider},
                      "configuration": {"StackName": "Prod-Stack"} if provider == "CloudFormation" else {},
                      "region": "us-east-1"},
            "output": {"executionResult": result or {}}}


STRUCTURE = {"stages": [
    {"name": "Source", "actions": [{"name": "GitHub"}]},
    {"name": "Build", "actions": [{"name": "Synth", "runOrder": 1}, {"name": "Assets", "runOrder": 2}]},
    {"name": "Prod", "actions": [{"name": "ApproveProd", "runOrder": 1}, {"name": "Deploy", "runOrder": 2}]},
]}


def test_a_run_lists_what_it_started_from_and_how_long_it_took():
    run = health.run_row({
        "pipelineExecutionId": "r2", "status": "Succeeded", "startTime": T0, "lastUpdateTime": T0 + timedelta(minutes=14),
        "trigger": {"triggerType": "Webhook", "triggerDetail": "arn:webhook"},
        "sourceRevisions": [{"actionName": "GitHub", "revisionId": "abc", "revisionUrl": "u",
                             "revisionSummary": json.dumps({"CommitMessage": "feat: x\n"})}]})
    assert (run["id"], run["durationSeconds"], run["trigger"]) == ("r2", 14 * 60, "Webhook")
    assert run["revisions"] == [{"source": "GitHub", "revision": "abc", "message": "feat: x", "url": "u"}]


def test_an_action_says_where_to_look_and_builds_carry_their_build_for_logs():
    build = health.action_row(action_execution("Build", "Synth", "r1", "Failed", provider="CodeBuild", result={
        "externalExecutionId": "proj:123", "externalExecutionUrl": "https://build", "errorDetails": {"message": "exit 1"}}))
    assert (build["buildId"], build["error"], build["url"], build["durationSeconds"]) == (
        "proj:123", "exit 1", "https://build", 120)
    deploy = health.action_row(action_execution("Prod", "Deploy", "r1", result={"externalExecutionId": "stack-arn"}))
    assert (deploy["buildId"], deploy["stackName"], deploy["error"]) == (None, "Prod-Stack", None)
    ordered = health.order_actions([deploy, build, {**build, "action": "Assets"}, {**deploy, "action": "ApproveProd"}],
                                   STRUCTURE)
    assert [(a["stage"], a["action"]) for a in ordered] == [
        ("Build", "Synth"), ("Build", "Assets"), ("Prod", "ApproveProd"), ("Prod", "Deploy")]


def test_each_stage_shows_the_newest_run_it_fully_succeeded_in():
    newest_first = [
        action_execution("Prod", "ApproveProd", "r3", "InProgress", minutes=30),
        action_execution("Build", "Assets", "r3", minutes=25),
        action_execution("Build", "Synth", "r3", minutes=20),
        # r2's deploy failed after a retry; the retry is newer, so r2 never passed Prod.
        action_execution("Prod", "Deploy", "r2", "Failed", minutes=16),
        action_execution("Prod", "Deploy", "r2", "Succeeded", minutes=15),
        action_execution("Prod", "ApproveProd", "r2", minutes=12),
        action_execution("Build", "Synth", "r2", "Failed", minutes=10),
        action_execution("Prod", "Deploy", "r1", minutes=5),
        action_execution("Prod", "ApproveProd", "r1", minutes=4),
    ]
    found = health.last_successes(newest_first, STRUCTURE)
    assert {stage: s["runId"] for stage, s in found.items()} == {"Build": "r3", "Prod": "r1"}
    assert found["Prod"]["at"] == "2026-11-20T09:07:00+00:00"


def test_only_failed_or_stopped_stages_can_be_retried_and_only_in_their_run():
    state = {"stageStates": [
        {"stageName": "Build", "latestExecution": {"status": "Succeeded", "pipelineExecutionId": "r3"}},
        {"stageName": "Dev", "latestExecution": {"status": "Failed", "pipelineExecutionId": "r2"}},
        {"stageName": "Prod", "latestExecution": {"status": "Stopped", "pipelineExecutionId": "r1"}},
        {"stageName": "Never"},
    ]}
    assert health.retryable_stages(state) == {"Dev": "r2", "Prod": "r1"}


def test_build_actions_sort_by_number_not_by_text():
    rows = [health.action_row(action_execution("Assets", f"FileAsset{n}", "r1")) for n in (10, 2, 1)]
    assert [a["action"] for a in health.order_actions(rows, {"stages": []})] == ["FileAsset1", "FileAsset2", "FileAsset10"]


def test_where_a_stage_is_comes_from_its_latest_success_else_the_newest_run_that_succeeded():
    state = {"stageStates": [
        {"stageName": "Build", "latestExecution": {"status": "Succeeded", "pipelineExecutionId": "r5"}, "actionStates": [
            {"actionName": "Synth", "latestExecution": {"lastStatusChange": T0}},
            {"actionName": "Assets", "latestExecution": {"lastStatusChange": T0 + timedelta(minutes=3)}}]},
        {"stageName": "Prod", "latestExecution": {"status": "Failed", "pipelineExecutionId": "r5"}, "actionStates": []},
    ]}
    assert health.succeeded_in_state(state) == {"Build": {"runId": "r5", "at": "2026-11-20T09:03:00+00:00"}}
    runs = [{"id": "r5", "status": "InProgress", "updatedAt": "b"}, {"id": "r4", "status": "Succeeded", "updatedAt": "a"}]
    assert health.newest_succeeded_run(runs) == {"runId": "r4", "at": "a"}
    assert health.newest_succeeded_run(runs[:1]) is None
