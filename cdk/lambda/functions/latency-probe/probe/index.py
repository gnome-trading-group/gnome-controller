"""
Latency Probe Lambda - Measures HTTP and WebSocket latency to a target URL.
Deployed to multiple AWS regions for cross-region latency testing.
"""
import json
import time
import socket
import ssl
import statistics
from urllib.parse import urlparse
from typing import Any

import requests
import websocket


def measure_http_latency(url: str, method: str = "GET", timeout: float = 10.0) -> float:
    """Measure HTTP request latency in milliseconds."""
    start = time.perf_counter()
    response = requests.request(method, url, timeout=timeout)
    response.raise_for_status()
    end = time.perf_counter()
    return (end - start) * 1000


def measure_websocket_latency(url: str, timeout: float = 10.0) -> float:
    """Measure WebSocket connection handshake latency in milliseconds."""
    start = time.perf_counter()
    ws = websocket.create_connection(url, timeout=timeout)
    end = time.perf_counter()
    ws.close()
    return (end - start) * 1000


def measure_tcp_latency(host: str, port: int, use_ssl: bool = False, timeout: float = 10.0) -> float:
    """Measure raw TCP connection latency in milliseconds."""
    start = time.perf_counter()
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    
    try:
        sock.connect((host, port))
        if use_ssl:
            context = ssl.create_default_context()
            sock = context.wrap_socket(sock, server_hostname=host)
        end = time.perf_counter()
        return (end - start) * 1000
    finally:
        sock.close()


def calculate_percentile(data: list[float], percentile: float) -> float:
    """Calculate percentile of a sorted list."""
    if not data:
        return 0.0
    sorted_data = sorted(data)
    index = (percentile / 100) * (len(sorted_data) - 1)
    lower = int(index)
    upper = lower + 1
    if upper >= len(sorted_data):
        return sorted_data[-1]
    weight = index - lower
    return sorted_data[lower] * (1 - weight) + sorted_data[upper] * weight


def run_latency_test(
    url: str,
    protocol: str,
    method: str = "GET",
    samples: int = 5,
    warmup: bool = True,
    timeout: float = 10.0,
) -> dict[str, Any]:
    """Run latency test with multiple samples."""
    parsed = urlparse(url)
    
    try:
        # Warmup round (results discarded)
        if warmup:
            if protocol == "http":
                measure_http_latency(url, method, timeout)
            elif protocol == "websocket":
                measure_websocket_latency(url, timeout)
            elif protocol == "tcp":
                port = parsed.port or (443 if parsed.scheme == "https" else 80)
                use_ssl = parsed.scheme in ("https", "wss")
                measure_tcp_latency(parsed.hostname, port, use_ssl, timeout)
        
        # Collect samples
        latencies: list[float] = []
        for _ in range(samples):
            if protocol == "http":
                latency = measure_http_latency(url, method, timeout)
            elif protocol == "websocket":
                latency = measure_websocket_latency(url, timeout)
            elif protocol == "tcp":
                port = parsed.port or (443 if parsed.scheme == "https" else 80)
                use_ssl = parsed.scheme in ("https", "wss")
                latency = measure_tcp_latency(parsed.hostname, port, use_ssl, timeout)
            else:
                raise ValueError(f"Unknown protocol: {protocol}")
            latencies.append(round(latency, 2))
        
        return {
            "status": "success",
            "latencies": {
                "samples": latencies,
                "min": round(min(latencies), 2),
                "max": round(max(latencies), 2),
                "avg": round(statistics.mean(latencies), 2),
                "p50": round(calculate_percentile(latencies, 50), 2),
                "p95": round(calculate_percentile(latencies, 95), 2),
            }
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "latencies": None
        }


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Lambda handler for latency probe."""
    # Can be invoked directly with payload or via API Gateway
    body = event if "url" in event else json.loads(event.get("body", "{}"))
    
    url = body.get("url")
    protocol = body.get("protocol", "http")
    method = body.get("method", "GET")
    samples = body.get("samples", 5)
    warmup = body.get("warmup", True)
    timeout = body.get("timeout", 10000) / 1000  # Convert ms to seconds
    
    if not url:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "url is required"})
        }
    
    result = run_latency_test(url, protocol, method, samples, warmup, timeout)
    
    return {
        "statusCode": 200 if result["status"] == "success" else 500,
        "body": json.dumps(result)
    }
