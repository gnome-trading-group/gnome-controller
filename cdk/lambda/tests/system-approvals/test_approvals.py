import json

import pytest

import index as approvals


def event(body, email="mason@gnometrading.group"):
    claims = {"email": email} if email else {}
    return {"body": json.dumps(body), "requestContext": {"authorizer": {"claims": claims}}}


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
