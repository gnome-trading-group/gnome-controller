"""
Latency Probe Orchestrator Lambda - Invokes probe Lambdas across regions and collates results.
"""
import json
import os
import concurrent.futures
from datetime import datetime, timezone
from typing import Any, Dict
from utils import lambda_handler

import boto3

REGION_NAMES = {
    "us-east-1": "N. Virginia",
    "us-east-2": "Ohio",
    "us-west-1": "N. California",
    "us-west-2": "Oregon",
    "eu-west-1": "Ireland",
    "eu-west-2": "London",
    "eu-central-1": "Frankfurt",
    "ap-northeast-1": "Tokyo",
    "ap-northeast-2": "Seoul",
    "ap-southeast-1": "Singapore",
    "ap-southeast-2": "Sydney",
    "ap-south-1": "Mumbai",
    "sa-east-1": "São Paulo",
}

DEFAULT_REGIONS = [
    "us-east-1",
    "us-west-2", 
    "eu-west-1",
    "eu-central-1",
    "ap-northeast-1",
    "ap-southeast-1",
]

PROBE_LAMBDA_NAME = os.environ.get("PROBE_LAMBDA_NAME", "latency-probe")


def invoke_probe_lambda(region: str, target: Dict[str, Any], samples: int, warmup: bool, timeout: int) -> Dict[str, Any]:
    """Invoke a probe Lambda in a specific region."""
    try:
        client = boto3.client("lambda", region_name=region)
        
        payload = {
            "url": target["url"],
            "protocol": target.get("protocol", "http"),
            "method": target.get("method", "GET"),
            "samples": samples,
            "warmup": warmup,
            "timeout": timeout,
        }
        
        response = client.invoke(
            FunctionName=PROBE_LAMBDA_NAME,
            InvocationType="RequestResponse",
            Payload=json.dumps(payload),
        )
        
        response_payload = json.loads(response["Payload"].read())
        
        # Handle both direct response and API Gateway-style response
        if "body" in response_payload:
            result = json.loads(response_payload["body"])
        else:
            result = response_payload
            
        return {
            "region": region,
            "regionName": REGION_NAMES.get(region, region),
            **result,
        }
    except Exception as e:
        return {
            "region": region,
            "regionName": REGION_NAMES.get(region, region),
            "status": "error",
            "error": str(e),
            "latencies": None,
        }


@lambda_handler
def handler(body):
    """Lambda handler for orchestrating latency probes across regions."""
    targets = body.get("targets", [])
    regions = body.get("regions", DEFAULT_REGIONS)
    samples = body.get("samples", 5)
    warmup = body.get("warmup", True)
    timeout = body.get("timeout", 10000)
    
    if not targets:
        raise ValueError("targets is required")
    
    results = []
    
    for target in targets:
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(regions)) as executor:
            futures = {
                executor.submit(invoke_probe_lambda, region, target, samples, warmup, timeout): region
                for region in regions
            }
            
            region_results = []
            for future in concurrent.futures.as_completed(futures):
                region_results.append(future.result())
        
        # Sort by average latency (successful probes first)
        region_results.sort(
            key=lambda x: (
                x["status"] != "success",
                x.get("latencies", {}).get("avg", float("inf")) if x.get("latencies") else float("inf"),
            )
        )
        
        results.append({
            "target": {
                "url": target["url"],
                "protocol": target.get("protocol", "http"),
            },
            "regions": region_results,
        })
    
    response_body = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "results": results,
    }
    return response_body

