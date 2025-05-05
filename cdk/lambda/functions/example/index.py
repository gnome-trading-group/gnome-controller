import json
import os

def handler(event, context):
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps({
            "message": "Hello from Gnome Controller API!",
            "stage": os.environ.get("STAGE", "unknown"),
        }),
    } 