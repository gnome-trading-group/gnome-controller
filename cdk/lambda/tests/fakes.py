"""Stand-ins for the boto3 clients the Lambdas hold at module level, recording what they're asked to do."""
from __future__ import annotations

import contextlib
import io


class ClientError(Exception):
    pass


class _Exceptions:
    ClientError = ClientError
    ConditionalCheckFailedException = type("ConditionalCheckFailedException", (Exception,), {})
    ResourceNotFoundException = type("ResourceNotFoundException", (Exception,), {})


class FakeS3:
    exceptions = _Exceptions

    def __init__(self, keys=()):
        self.objects: dict[str, bytes] = {k: b"" for k in keys}

    def put_object(self, Bucket, Key, Body, **_):
        self.objects[Key] = Body

    def get_object(self, Bucket, Key):
        if Key not in self.objects:
            raise ClientError(Key)
        return {"Body": io.BytesIO(self.objects[Key])}

    def head_object(self, Bucket, Key):
        if Key not in self.objects:
            raise ClientError(Key)
        return {}

    def generate_presigned_url(self, method, Params, ExpiresIn):
        return f"https://signed/{method}/{Params['Key']}"


class FakeBatch:
    def __init__(self, fail=False):
        self.submitted: list[dict] = []
        self.terminated: list[str] = []
        self.fail = fail

    def submit_job(self, **kwargs):
        if self.fail:
            raise RuntimeError("no capacity")
        self.submitted.append(kwargs)
        return {"jobId": "job-1"}

    def terminate_job(self, jobId, reason):
        self.terminated.append(jobId)


class FakeLogs:
    """Streams of (timestamp, message) events; a page is the newest `limit` events before the token's position."""
    exceptions = _Exceptions

    def __init__(self, streams=None):
        self.streams = streams or {}

    def get_log_events(self, logGroupName, logStreamName, limit, startFromHead, nextToken=None):
        if logStreamName not in self.streams:
            raise _Exceptions.ResourceNotFoundException()
        events = self.streams[logStreamName]
        end = int(nextToken.removeprefix("b/")) if nextToken else len(events)
        start = max(0, end - limit)
        page = [{"timestamp": t, "message": m} for t, m in events[start:end]]
        return {"events": page, "nextBackwardToken": f"b/{start}"}


class FakeTable:
    """Items keyed by (run_id, sk). update_item applies plain SET expressions and honours conditions on #st."""

    class meta:
        class client:
            exceptions = _Exceptions

    def __init__(self, items=()):
        self.items = {(i["run_id"], i["sk"]): dict(i) for i in items}

    def put_item(self, Item):
        self.items[(Item["run_id"], Item["sk"])] = dict(Item)

    @contextlib.contextmanager
    def batch_writer(self):
        yield self

    def get_item(self, Key):
        item = self.items.get((Key["run_id"], Key["sk"]))
        return {"Item": dict(item)} if item else {}

    def query(self, **kwargs):
        run_id = kwargs["KeyConditionExpression"].get_expression()["values"][1]
        return {"Items": [dict(v) for (r, _), v in sorted(self.items.items()) if r == run_id]}

    def update_item(self, Key, UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames=None,
                    ConditionExpression=None):
        names = ExpressionAttributeNames or {}
        key = (Key["run_id"], Key["sk"])
        item = self.items.get(key)
        if ConditionExpression:
            if item is None:
                raise _Exceptions.ConditionalCheckFailedException()
            current = item.get("status")
            allowed = [v for k, v in ExpressionAttributeValues.items() if k.startswith(":from")]
            finished = [ExpressionAttributeValues.get(":succeeded"), ExpressionAttributeValues.get(":failed")]
            if (allowed and current not in allowed) or (not allowed and current in finished):
                raise _Exceptions.ConditionalCheckFailedException()
        item = self.items.setdefault(key, dict(Key))
        for assignment in UpdateExpression.removeprefix("SET ").split(", "):
            field, value = (s.strip() for s in assignment.split("="))
            item[names.get(field, field)] = ExpressionAttributeValues[value]
