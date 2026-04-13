"""Playground chat Lambda — Gnomie agent with GitHub API for code changes."""
import base64
import json
import os
from typing import Any

import anthropic
import boto3
import requests as http_requests

from utils import create_response

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
GITHUB_REPO = os.environ.get("GITHUB_REPO", "gnome-trading-group/gnomepy-research")
GITHUB_API = "https://api.github.com"
ANTHROPIC_SECRET_ARN = os.environ.get("ANTHROPIC_SECRET_ARN", "")
GH_TOKEN_SECRET_ARN = os.environ.get("GH_TOKEN_SECRET_ARN", "")
CONTROLLER_API_URL = os.environ.get("CONTROLLER_API_URL", "")

secrets_client = boto3.client("secretsmanager")

_cached_anthropic_key: str | None = None
_cached_gh_token: str | None = None


def _get_anthropic_key() -> str:
    global _cached_anthropic_key
    if _cached_anthropic_key is None:
        _cached_anthropic_key = secrets_client.get_secret_value(
            SecretId=ANTHROPIC_SECRET_ARN
        )["SecretString"]
    return _cached_anthropic_key


def _get_gh_token() -> str:
    global _cached_gh_token
    if _cached_gh_token is None:
        _cached_gh_token = secrets_client.get_secret_value(
            SecretId=GH_TOKEN_SECRET_ARN
        )["SecretString"]
    return _cached_gh_token


def _gh_headers() -> dict[str, str]:
    return {
        "Authorization": f"token {_get_gh_token()}",
        "Accept": "application/vnd.github.v3+json",
    }


# ---------------------------------------------------------------------------
# Access guardrails
# ---------------------------------------------------------------------------
ALLOWED_READ_PATHS = [
    "gnomepy_research/strategies/",
    "gnomepy_research/signals/",
    "presets/",
]
ALLOWED_WRITE_PATHS = [
    "gnomepy_research/strategies/",
]
ALLOWED_CONFIG_FIELDS = {
    "strategy_args", "exchanges", "schema_type", "start_date", "end_date", "strategy",
}
ALLOWED_MODELS = {
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-6-20250514",
    "claude-opus-4-6-20250514",
}
DEFAULT_MODEL = "claude-haiku-4-5-20251001"

# ---------------------------------------------------------------------------
# GitHub adapter
# ---------------------------------------------------------------------------
_session_branches: dict[str, str] = {}


def _get_default_branch_sha() -> str:
    resp = http_requests.get(
        f"{GITHUB_API}/repos/{GITHUB_REPO}/git/ref/heads/main",
        headers=_gh_headers(),
    )
    resp.raise_for_status()
    return resp.json()["object"]["sha"]


def _create_branch(branch_name: str, from_sha: str) -> None:
    resp = http_requests.post(
        f"{GITHUB_API}/repos/{GITHUB_REPO}/git/refs",
        headers=_gh_headers(),
        json={"ref": f"refs/heads/{branch_name}", "sha": from_sha},
    )
    if resp.status_code == 422:
        return
    resp.raise_for_status()


def _get_file_sha(branch: str, file_path: str) -> str | None:
    resp = http_requests.get(
        f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/{file_path}",
        headers=_gh_headers(),
        params={"ref": branch},
    )
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()["sha"]


def _read_file_github(branch: str, file_path: str) -> str | None:
    resp = http_requests.get(
        f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/{file_path}",
        headers=_gh_headers(),
        params={"ref": branch},
    )
    if resp.status_code != 200:
        return None
    return base64.b64decode(resp.json()["content"]).decode()


def _commit_file(branch: str, file_path: str, content: str, message: str) -> str:
    payload: dict[str, Any] = {
        "message": message,
        "content": base64.b64encode(content.encode()).decode(),
        "branch": branch,
    }
    file_sha = _get_file_sha(branch, file_path)
    if file_sha:
        payload["sha"] = file_sha
    resp = http_requests.put(
        f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/{file_path}",
        headers=_gh_headers(),
        json=payload,
    )
    resp.raise_for_status()
    return resp.json()["commit"]["sha"]


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

def _validate_path(file_path: str, allowed: list[str]) -> str | None:
    if not any(file_path.startswith(p) for p in allowed):
        return f"Access denied: path must be in {allowed}"
    return None


def tool_list_presets(**kw) -> dict:
    # Read presets from GitHub main branch.
    resp = http_requests.get(
        f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/presets",
        headers=_gh_headers(),
    )
    if resp.status_code != 200:
        return {"presets": []}
    files = resp.json()
    presets = []
    for f in files:
        if f["name"].endswith(".yaml"):
            content = _read_file_github("main", f"presets/{f['name']}")
            presets.append({"name": f["name"].replace(".yaml", ""), "config": content or ""})
    return {"presets": presets}


def tool_get_preset(name: str, **kw) -> dict:
    content = _read_file_github("main", f"presets/{name}.yaml")
    if content is None:
        return {"error": f"Preset '{name}' not found"}
    return {"name": name, "config": content}


def tool_edit_config(updates: dict, **kw) -> dict:
    for key in updates:
        if key.split(".")[0] not in ALLOWED_CONFIG_FIELDS:
            return {"error": f"Cannot modify '{key}'. Allowed: {ALLOWED_CONFIG_FIELDS}"}
    return {"applied_updates": updates, "status": "ok"}


def tool_submit_backtest(config: str, research_commit: str | None = None, **kw) -> dict:
    import yaml
    try:
        parsed = yaml.safe_load(config)
    except Exception as e:
        return {"error": f"Invalid YAML: {e}"}
    if "start_date" not in parsed:
        return {"error": "Config must include start_date"}
    if "end_date" not in parsed:
        return {"error": "Config must include end_date"}

    payload: dict = {"config": config}
    if research_commit:
        payload["researchCommit"] = research_commit
    try:
        resp = http_requests.post(
            f"{CONTROLLER_API_URL}/backtests",
            json=payload, timeout=300,
        )
        return resp.json()
    except Exception as e:
        return {"error": str(e)}


def tool_get_report_summary(job_id: str, **kw) -> dict:
    try:
        resp = http_requests.get(f"{CONTROLLER_API_URL}/backtests/{job_id}", timeout=30)
        return resp.json()
    except Exception as e:
        return {"error": str(e)}


def tool_list_strategies(**kw) -> dict:
    # Read strategy files from GitHub.
    resp = http_requests.get(
        f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/gnomepy_research/strategies",
        headers=_gh_headers(),
    )
    if resp.status_code != 200:
        return {"strategies": []}
    files = resp.json()
    strategies = []
    for f in files:
        if f["name"].endswith(".py") and not f["name"].startswith("_"):
            strategies.append({
                "file": f"gnomepy_research/strategies/{f['name']}",
                "name": f["name"].replace(".py", ""),
            })
    return {"strategies": strategies}


def tool_read_strategy_code(file_path: str, session_id: str = "default", **kw) -> dict:
    error = _validate_path(file_path, ALLOWED_READ_PATHS)
    if error:
        return {"error": error}
    # Read from session branch if it exists, else main.
    branch = _session_branches.get(session_id, "main")
    content = _read_file_github(branch, file_path)
    if content is None:
        return {"error": f"File not found: {file_path}"}
    return {"file_path": file_path, "content": content}


def tool_suggest_code_change(file_path: str, original: str, replacement: str, explanation: str, **kw) -> dict:
    error = _validate_path(file_path, ALLOWED_WRITE_PATHS)
    if error:
        return {"error": error}
    return {
        "file_path": file_path,
        "original": original,
        "replacement": replacement,
        "explanation": explanation,
        "status": "pending_approval",
    }


def tool_apply_code_change(file_path: str, original: str, replacement: str, session_id: str = "default", **kw) -> dict:
    error = _validate_path(file_path, ALLOWED_WRITE_PATHS)
    if error:
        return {"error": error}

    branch_name = _session_branches.get(session_id)
    try:
        if branch_name is None:
            branch_name = f"gnomie/{session_id}"
            _session_branches[session_id] = branch_name
            base_sha = _get_default_branch_sha()
            _create_branch(branch_name, base_sha)

        # Read current file from branch.
        content = _read_file_github(branch_name, file_path)
        if content is None:
            return {"error": f"File not found: {file_path}"}

        if original in content:
            new_content = content.replace(original, replacement, 1)
        else:
            return {"error": "Original snippet not found in file"}

        commit_sha = _commit_file(branch_name, file_path, new_content, f"gnomie: update {file_path}")
        return {"status": "applied", "branch": branch_name, "commit": commit_sha, "file_path": file_path}
    except Exception as e:
        return {"error": str(e)}


TOOL_DISPATCH = {
    "list_presets": tool_list_presets,
    "get_preset": tool_get_preset,
    "edit_config": tool_edit_config,
    "submit_backtest": tool_submit_backtest,
    "get_report_summary": tool_get_report_summary,
    "list_strategies": tool_list_strategies,
    "read_strategy_code": tool_read_strategy_code,
    "suggest_code_change": tool_suggest_code_change,
    "apply_code_change": tool_apply_code_change,
}

# ---------------------------------------------------------------------------
# Tool schemas (same as dev server)
# ---------------------------------------------------------------------------
TOOLS = [
    {"name": "list_presets", "description": "List available backtest presets.", "input_schema": {"type": "object", "properties": {}, "required": []}},
    {"name": "get_preset", "description": "Get a preset's YAML config.", "input_schema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}},
    {"name": "edit_config", "description": "Edit backtest config fields.", "input_schema": {"type": "object", "properties": {"updates": {"type": "object"}}, "required": ["updates"]}},
    {"name": "submit_backtest", "description": "Submit a backtest. Config MUST include start_date and end_date.", "input_schema": {"type": "object", "properties": {"config": {"type": "string"}, "research_commit": {"type": "string"}}, "required": ["config"]}},
    {"name": "get_report_summary", "description": "Get report metrics from a completed backtest.", "input_schema": {"type": "object", "properties": {"job_id": {"type": "string"}}, "required": ["job_id"]}},
    {"name": "list_strategies", "description": "List available strategy classes.", "input_schema": {"type": "object", "properties": {}, "required": []}},
    {"name": "read_strategy_code", "description": "Read a strategy or signal source file.", "input_schema": {"type": "object", "properties": {"file_path": {"type": "string"}}, "required": ["file_path"]}},
    {"name": "suggest_code_change", "description": "Suggest a code change (shown as diff for user approval).", "input_schema": {"type": "object", "properties": {"file_path": {"type": "string"}, "original": {"type": "string"}, "replacement": {"type": "string"}, "explanation": {"type": "string"}}, "required": ["file_path", "original", "replacement", "explanation"]}},
]

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """You are Gnomie, a quantitative trading assistant for the GNOME backtesting platform.

You have tools to list presets, read strategies, edit configs, run backtests, and suggest code changes.

Key rules:
- Preset configs do NOT include start_date/end_date — you MUST add them before submitting
- After code changes are applied, pass the branch name as research_commit to submit_backtest
- Be concise and actionable
"""

# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------
def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    if event.get("httpMethod") == "OPTIONS":
        return create_response(200, {})

    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, TypeError):
        return create_response(400, {"error": "Invalid JSON"})

    conversation = body.get("conversation", [])
    config = body.get("config")
    model = body.get("model", DEFAULT_MODEL)
    system_prompt = body.get("system_prompt")

    if model not in ALLOWED_MODELS:
        model = DEFAULT_MODEL

    client = anthropic.Anthropic(api_key=_get_anthropic_key())

    system = (system_prompt or "") + "\n\n" + SYSTEM_PROMPT
    if config:
        system += f"\n\nCurrent config:\n```yaml\n{config}\n```"

    new_messages = []
    config_updates = None
    code_suggestions = []

    response = client.messages.create(
        model=model, max_tokens=4096, system=system,
        tools=TOOLS, messages=conversation,
    )

    while response.stop_reason == "tool_use":
        assistant_content = []
        for block in response.content:
            if block.type == "text":
                assistant_content.append({"type": "text", "text": block.text})
            elif block.type == "tool_use":
                assistant_content.append({"type": "tool_use", "id": block.id, "name": block.name, "input": block.input})

        new_messages.append({"role": "assistant", "content": assistant_content})

        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            tool_fn = TOOL_DISPATCH.get(block.name)
            if tool_fn is None:
                result = {"error": f"Unknown tool: {block.name}"}
            else:
                try:
                    result = tool_fn(**block.input)
                except Exception as e:
                    result = {"error": str(e)}

            if block.name == "edit_config" and "error" not in result:
                config_updates = result.get("applied_updates")
            if block.name == "suggest_code_change" and result.get("status") == "pending_approval":
                code_suggestions.append(result)

            tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)})

        new_messages.append({"role": "user", "content": tool_results})

        response = client.messages.create(
            model=model, max_tokens=4096, system=system,
            tools=TOOLS, messages=conversation + new_messages,
        )

    final_text = ""
    for block in response.content:
        if block.type == "text":
            final_text += block.text
    new_messages.append({"role": "assistant", "content": final_text})

    return create_response(200, {
        "messages": new_messages,
        "config_updates": config_updates,
        "code_suggestions": code_suggestions,
    })
