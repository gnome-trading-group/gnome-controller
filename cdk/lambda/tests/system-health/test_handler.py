import json

import index


def test_an_unknown_section_is_refused_without_calling_aws():
    response = index.handler({"queryStringParameters": {"section": "nope"}}, None)
    assert response["statusCode"] == 400
    assert "alarms" in json.loads(response["body"])["message"]


def test_build_logs_need_a_build():
    response = index.handler({"resource": "/system/pipelines/{name}/logs", "pathParameters": {"name": "p"},
                              "queryStringParameters": {}}, None)
    assert response["statusCode"] == 400
    assert "build" in json.loads(response["body"])["message"]
