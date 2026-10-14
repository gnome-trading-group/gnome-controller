import json

import index


class _Table:
    def __init__(self, items):
        self.items = items
        self.updates = []

    def query(self, **_):
        return {"Items": self.items}

    def update_item(self, **kwargs):
        self.updates.append(kwargs)


class _Events:
    def __init__(self):
        self.sent = []

    def put_events(self, Entries):
        self.sent.extend(json.loads(e["Detail"]) for e in Entries)


def _stopped(exit_code):
    return {"detail": {"taskArn": "arn:task/1", "lastStatus": "STOPPED", "containers": [{"exitCode": exit_code}]}}


def _setup(monkeypatch, items):
    table, events = _Table(items), _Events()
    monkeypatch.setattr(index, "_table", table)
    monkeypatch.setattr(index, "_events", events)
    return table, events


def test_a_crashed_scheduled_run_is_marked_failed_and_alerted(monkeypatch):
    table, events = _setup(monkeypatch, [{"sk": "RUN#p#r1", "status": "RUNNING", "pipeline_name": "cs2_prematch_predict",
                                          "run_id": "r1", "trigger": "scheduled"}])

    index.handler(_stopped(137), None)

    assert table.updates[0]["ExpressionAttributeValues"][":s"] == "FAILED"
    assert events.sent == [{
        "action": "FIRING", "key": "PIPELINE_FAILED:cs2_prematch_predict:r1", "type": "PIPELINE_FAILED",
        "source": "ingest", "title": "Pipeline cs2_prematch_predict failed", "body": "ECS task stopped with exit code 137",
        "labels": {"pipeline": "cs2_prematch_predict", "runId": "r1", "trigger": "scheduled"},
        "stateAt": events.sent[0]["stateAt"],
    }]


def test_a_failure_the_runner_recorded_is_alerted_with_its_own_error(monkeypatch):
    table, events = _setup(monkeypatch, [{"sk": "RUN#p#r2", "status": "FAILED", "pipeline_name": "hltv_cs2",
                                          "run_id": "r2", "trigger": "manual", "error_message": "HLTV returned 403"}])

    index.handler(_stopped(1), None)

    assert table.updates == []
    assert events.sent[0]["body"] == "HLTV returned 403"
    assert events.sent[0]["labels"]["trigger"] == "manual"


def test_a_clean_exit_reports_nothing(monkeypatch):
    table, events = _setup(monkeypatch, [{"sk": "RUN#p#r3", "status": "RUNNING"}])

    index.handler(_stopped(0), None)

    assert table.updates == [] and events.sent == []


def test_alerting_failing_never_fails_the_status_update(monkeypatch):
    table, _ = _setup(monkeypatch, [{"sk": "RUN#p#r4", "status": "RUNNING", "pipeline_name": "x", "run_id": "r4"}])

    class _Down:
        def put_events(self, Entries):
            raise RuntimeError("bus unreachable")

    monkeypatch.setattr(index, "_events", _Down())
    index.handler(_stopped(1), None)
    assert len(table.updates) == 1
