"""Gnomie agent Lambda handler — uses shared agent core + prod adapter."""
import json
import os
from typing import Any

import boto3

from utils import create_response

from agent.core import handle_chat
from agent.adapters.prod import ProdAdapter

secrets_client = boto3.client("secretsmanager")

# Cache resolved keys across invocations.
_cached_keys: dict[str, str] = {}

# Map of provider → Secrets Manager ARN env var.
_SECRET_ARN_MAP = {
    "anthropic": "ANTHROPIC_SECRET_ARN",
    "openai": "OPENAI_SECRET_ARN",
}


def _get_api_keys() -> dict[str, str]:
    """Resolve API keys from Secrets Manager, caching across invocations."""
    for provider, env_var in _SECRET_ARN_MAP.items():
        if provider in _cached_keys:
            continue
        arn = os.environ.get(env_var, "")
        if arn:
            try:
                _cached_keys[provider] = secrets_client.get_secret_value(
                    SecretId=arn
                )["SecretString"]
            except Exception:
                pass  # Provider not configured — skip.
    return _cached_keys


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    if event.get("httpMethod") == "OPTIONS":
        return create_response(200, {})

    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, TypeError):
        return create_response(400, {"error": "Invalid JSON"})

    conversation = body.get("conversation", [])
    config = body.get("config")
    model = body.get("model")
    system_prompt = body.get("system_prompt")

    adapter = ProdAdapter()

    try:
        result = handle_chat(
            adapter, conversation,
            config=config, model=model,
            system_prompt=system_prompt,
            api_keys=_get_api_keys(),
        )
        return create_response(200, result)
    except Exception as e:
        return create_response(500, {"error": str(e)})
