import json

import pytest

from conftest import load
from fakes import FakeS3

inputs = load("inputs")

FILES = [{"path": "b.parquet", "size": 2, "sha256": "2" * 64}, {"path": "dir/a.parquet", "size": 1, "sha256": "1" * 64}]


def test_the_digest_ignores_file_order():
    assert inputs.manifest_digest(FILES) == inputs.manifest_digest(list(reversed(FILES)))
    assert inputs.manifest_digest(FILES) != inputs.manifest_digest([{**FILES[0], "size": 3}, FILES[1]])


@pytest.mark.parametrize("path", ["../x", "/abs", "a//b", "./a", "a/", "manifest.json", "sp ace", ""])
def test_paths_that_could_escape_or_collide_are_refused(path):
    with pytest.raises(ValueError):
        inputs.parse({"files": [{"path": path, "size": 1, "sha256": "1" * 64}]})


def test_duplicate_paths_are_refused():
    with pytest.raises(ValueError, match="twice"):
        inputs.parse({"files": [FILES[0], FILES[0]]})


def test_a_new_set_gets_an_upload_url_per_file_and_one_for_the_manifest(monkeypatch):
    monkeypatch.setattr(inputs, "_s3", FakeS3())
    body = json.loads(inputs.handler({"body": json.dumps({"files": FILES})}, None)["body"])
    digest = inputs.manifest_digest(FILES)
    assert body["exists"] is False
    assert body["uri"] == f"s3://gnome-research-dev/research-jobs/inputs/{digest}/"
    assert set(body["uploads"]) == {"b.parquet", "dir/a.parquet"}
    assert body["manifest_upload"].endswith(f"inputs/{digest}/manifest.json")


def test_a_set_already_uploaded_is_not_uploaded_again(monkeypatch):
    digest = inputs.manifest_digest(FILES)
    monkeypatch.setattr(inputs, "_s3", FakeS3([f"research-jobs/inputs/{digest}/manifest.json"]))
    body = json.loads(inputs.handler({"body": json.dumps({"files": FILES})}, None)["body"])
    assert body == {"exists": True, "sha256": digest, "uri": f"s3://gnome-research-dev/research-jobs/inputs/{digest}/"}
