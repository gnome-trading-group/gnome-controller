import importlib.util
import os
import sys

# The Lambda's folder is uploaded as it is, so tests mustn't leave compiled files in it.
sys.dont_write_bytecode = True

HERE = os.path.dirname(os.path.abspath(__file__))
FUNCTIONS = os.path.join(HERE, "..", "..", "functions", "research-jobs")
sys.path.insert(0, os.path.join(HERE, "..", "..", "layers", "common", "python"))

os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.update({
    "DYNAMODB_TABLE": "gnome-research-jobs",
    "S3_BUCKET": "gnome-research-dev",
    "BATCH_JOB_QUEUE": "arn:aws:batch:us-east-1:1:job-queue/gnome-research-queue",
    "BATCH_JOB_DEFINITION": "arn:aws:batch:us-east-1:1:job-definition/gnome-research-job",
    "DEFAULT_CPU": "4",
    "DEFAULT_MEMORY_GIB": "14",
})


def load(function: str):
    """Each function's handler module is called index, so they're loaded under their own names."""
    spec = importlib.util.spec_from_file_location(f"research_jobs_{function.replace('-', '_')}",
                                                  os.path.join(FUNCTIONS, function, "index.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
