import json
from datetime import datetime, timezone

import health


def alarm(name, state="OK", since=datetime(2026, 10, 7, 12, tzinfo=timezone.utc), **extra):
    return {"AlarmName": name, "StateValue": state, "StateReason": f"{name} is {state}", "StateUpdatedTimestamp": since, **extra}


def test_an_alarm_belongs_to_the_service_its_name_starts_with():
    assert health.service_of("Registry-RegistryApi-FaultCount") == "Registry"
    assert health.service_of("MarketData-Collector-NoData") == "MarketData"
    assert health.service_of("cpu-high") == "cpu"
    assert health.service_of("standalone") == health.OTHER_SERVICE
    assert health.service_of("-leading") == health.OTHER_SERVICE


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
    row = health.pipeline_row("registry", "us-east-1", structure, state, {"status": "InProgress"}, NOW)
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
