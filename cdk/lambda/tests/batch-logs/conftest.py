import importlib.util
import os
import sys

# The Lambda's folder is uploaded as it is, so tests mustn't leave compiled files in it.
sys.dont_write_bytecode = True

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "layers", "common", "python"))
sys.path.insert(0, os.path.join(HERE, ".."))

os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.update({"DYNAMODB_TABLE": "gnome-research-jobs", "TASK_SK_PREFIX": "TASK#"})


def load():
    spec = importlib.util.spec_from_file_location(
        "batch_logs", os.path.join(HERE, "..", "..", "functions", "batch-logs", "index.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
