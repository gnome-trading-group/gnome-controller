import os
import sys

# The Lambda's folder is uploaded as it is, so tests mustn't leave compiled files in it.
sys.dont_write_bytecode = True
os.environ.setdefault("DYNAMODB_TABLE", "test-table")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "functions", "pipelines", "pipeline-status"))
