import json

import index


def test_an_unknown_section_is_refused_without_calling_aws():
    response = index.handler({"queryStringParameters": {"section": "nope"}}, None)
    assert response["statusCode"] == 400
    assert "alarms" in json.loads(response["body"])["message"]
