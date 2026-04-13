"""AI Agent Playground — Claude-powered backtest assistant.

Provides a chat endpoint that uses Claude with tool use to help users
configure, run, and interpret backtests through natural language.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import anthropic

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
    "strategy_args", "exchanges", "schema_type", "start_date", "end_date",
    "strategy",
}

RESEARCH_ROOT = Path(__file__).resolve().parent.parent.parent / "gnomepy-research"

# ---------------------------------------------------------------------------
# Tool definitions (Claude tool-use schema)
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "list_presets",
        "description": "List all available backtest preset names and their configs.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_preset",
        "description": "Get the YAML config for a specific preset by name.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Preset name (without .yaml)"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "edit_config",
        "description": "Edit fields in the current backtest YAML config. Only strategy_args, exchanges, schema_type, start_date, end_date, and strategy can be modified.",
        "input_schema": {
            "type": "object",
            "properties": {
                "updates": {
                    "type": "object",
                    "description": "Key-value pairs to update in the YAML config. Nested updates use dot notation (e.g. 'strategy_args.gamma': 0.05).",
                },
            },
            "required": ["updates"],
        },
    },
    {
        "name": "submit_backtest",
        "description": "Submit a backtest job. The config MUST include start_date and end_date (ISO format, e.g. '2026-01-23T10:30:00Z'). Always provide a descriptive name for the backtest.",
        "input_schema": {
            "type": "object",
            "properties": {
                "config": {"type": "string", "description": "Complete YAML config including start_date and end_date"},
                "name": {"type": "string", "description": "Short descriptive name for this backtest run (e.g. 'MM BTC tight spread', 'Momentum with stop-loss')"},
                "research_commit": {"type": "string", "description": "Git branch or commit SHA to run against. Use the branch/commit from apply_code_change results. Omit to use current working directory code."},
            },
            "required": ["config", "name"],
        },
    },
    {
        "name": "get_report_summary",
        "description": "Get scalar metrics from a completed backtest report (PnL, Sharpe, fills, fees, etc).",
        "input_schema": {
            "type": "object",
            "properties": {
                "job_id": {"type": "string", "description": "Backtest job ID"},
            },
            "required": ["job_id"],
        },
    },
    {
        "name": "list_strategies",
        "description": "List available strategy classes in gnomepy-research with their constructor parameters.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "read_strategy_code",
        "description": "Read the source code of a strategy or signal file.",
        "input_schema": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Relative path from gnomepy-research root (e.g. 'gnomepy_research/strategies/market_maker.py')",
                },
            },
            "required": ["file_path"],
        },
    },
    {
        "name": "suggest_code_change",
        "description": "Suggest a code change to a strategy file. Returns the diff for user approval — does NOT write the file.",
        "input_schema": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Relative path from gnomepy-research root",
                },
                "original": {
                    "type": "string",
                    "description": "The original code snippet to replace",
                },
                "replacement": {
                    "type": "string",
                    "description": "The new code to replace it with",
                },
                "explanation": {
                    "type": "string",
                    "description": "Brief explanation of the change",
                },
            },
            "required": ["file_path", "original", "replacement", "explanation"],
        },
    },
]

# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

def _validate_read_path(file_path: str) -> str | None:
    """Return error message if path is not allowed for reading."""
    if not any(file_path.startswith(p) for p in ALLOWED_READ_PATHS):
        return f"Access denied: can only read files in {ALLOWED_READ_PATHS}"
    return None


def _validate_write_path(file_path: str) -> str | None:
    """Return error message if path is not allowed for writing."""
    if not any(file_path.startswith(p) for p in ALLOWED_WRITE_PATHS):
        return f"Access denied: can only modify files in {ALLOWED_WRITE_PATHS}"
    return None


def tool_list_presets(**kwargs) -> dict:
    presets_dir = RESEARCH_ROOT / "presets"
    if not presets_dir.is_dir():
        return {"presets": []}
    presets = []
    for p in sorted(presets_dir.glob("*.yaml")):
        presets.append({"name": p.stem, "config": p.read_text()})
    return {"presets": presets}


def tool_get_preset(name: str, **kwargs) -> dict:
    path = RESEARCH_ROOT / "presets" / f"{name}.yaml"
    if not path.exists():
        return {"error": f"Preset '{name}' not found"}
    return {"name": name, "config": path.read_text()}


def tool_edit_config(updates: dict, **kwargs) -> dict:
    """Validate and return the updates — actual config editing happens in the frontend."""
    import yaml

    # Validate that only allowed top-level fields are being modified.
    for key in updates:
        top_key = key.split(".")[0]
        if top_key not in ALLOWED_CONFIG_FIELDS:
            return {"error": f"Cannot modify '{top_key}'. Allowed fields: {ALLOWED_CONFIG_FIELDS}"}

    return {"applied_updates": updates, "status": "ok"}


def tool_submit_backtest(config: str, name: str = "Gnomie backtest", research_commit: str | None = None, **kwargs) -> dict:
    """Submit a backtest and wait for it to complete. Returns the job summary."""
    import time
    import yaml as _yaml
    import requests

    try:
        parsed = _yaml.safe_load(config)
    except Exception as e:
        return {"error": f"Invalid YAML: {e}"}

    if "start_date" not in parsed:
        return {"error": "Config must include start_date (e.g. start_date: 2026-01-23T10:30:00Z)"}
    if "end_date" not in parsed:
        return {"error": "Config must include end_date (e.g. end_date: 2026-01-23T11:00:00Z)"}

    payload: dict = {"config": config, "name": name}
    if research_commit:
        payload["researchCommit"] = research_commit

    # Submit.
    try:
        resp = requests.post("http://localhost:5050/api/backtests", json=payload, timeout=10)
        submit_result = resp.json()
    except Exception as e:
        return {"error": f"Failed to submit: {e}"}

    job_id = submit_result.get("jobId")
    if not job_id:
        return submit_result  # error from server

    # Poll until done (backtests typically finish in seconds).
    for _ in range(120):  # 2 min max
        time.sleep(1)
        try:
            status_resp = requests.get(f"http://localhost:5050/api/backtests/{job_id}", timeout=5)
            job = status_resp.json()
            status = job.get("status", "")
            if status == "SUCCEEDED":
                # Fetch the report summary.
                summary = tool_get_report_summary(job_id)
                return {
                    "jobId": job_id,
                    "status": "SUCCEEDED",
                    "summary": summary.get("summary", {}),
                }
            if status == "FAILED":
                return {
                    "jobId": job_id,
                    "status": "FAILED",
                    "error": job.get("error", "Unknown error"),
                }
        except Exception:
            continue

    return {"jobId": job_id, "status": "TIMEOUT", "error": "Backtest did not complete within 2 minutes"}


def tool_get_report_summary(job_id: str, **kwargs) -> dict:
    """Load report summary from a completed backtest."""
    import pandas as pd

    out_dir = Path(os.environ.get("BACKTEST_OUTPUT_ROOT", "./backtest-runs")) / job_id
    market_path = out_dir / "market_records.parquet"
    exec_path = out_dir / "execution_records.parquet"

    if not market_path.exists():
        return {"error": f"No results found for job {job_id}"}

    try:
        from gnomepy_research.reporting.backtest.report import BacktestReport

        market_df = pd.read_parquet(market_path)
        exec_df = pd.read_parquet(exec_path) if exec_path.exists() else pd.DataFrame()
        intent_path = out_dir / "intent_records.parquet"
        intent_df = pd.read_parquet(intent_path) if intent_path.exists() else pd.DataFrame()

        report = BacktestReport.from_dataframes(
            market_df=market_df, exec_df=exec_df, intent_df=intent_df,
        )
        summary = report.summary()
        # Convert non-serializable values.
        clean = {}
        for k, v in summary.items():
            if isinstance(v, dict):
                clean[k] = {str(kk): float(vv) for kk, vv in v.items()}
            elif isinstance(v, float):
                clean[k] = round(v, 6)
            else:
                clean[k] = v
        return {"summary": clean}
    except Exception as e:
        return {"error": str(e)}


def tool_list_strategies(**kwargs) -> dict:
    """List strategy classes with their constructor params."""
    import inspect
    strategies = []

    strategies_dir = RESEARCH_ROOT / "gnomepy_research" / "strategies"
    for py_file in sorted(strategies_dir.glob("*.py")):
        if py_file.name.startswith("_"):
            continue
        module_name = py_file.stem
        try:
            import importlib
            mod = importlib.import_module(f"gnomepy_research.strategies.{module_name}")
            for name, cls in inspect.getmembers(mod, inspect.isclass):
                if cls.__module__ == mod.__name__:
                    sig = inspect.signature(cls.__init__)
                    params = []
                    for pname, param in sig.parameters.items():
                        if pname == "self":
                            continue
                        info = {"name": pname}
                        if param.default is not inspect.Parameter.empty:
                            info["default"] = repr(param.default)
                        if param.annotation is not inspect.Parameter.empty:
                            info["type"] = str(param.annotation)
                        params.append(info)
                    strategies.append({
                        "class": name,
                        "module": f"gnomepy_research.strategies.{module_name}",
                        "import_path": f"gnomepy_research.strategies.{module_name}:{name}",
                        "params": params,
                    })
        except Exception:
            pass

    return {"strategies": strategies}


def tool_read_strategy_code(file_path: str, session_id: str = "default", **kwargs) -> dict:
    error = _validate_read_path(file_path)
    if error:
        return {"error": error}
    # Read from worktree first (has latest applied changes), else main repo.
    from playground_worktree import read_file_from_worktree
    content = read_file_from_worktree(file_path, session_id)
    if content is not None:
        return {"file_path": file_path, "content": content, "source": "worktree"}
    full_path = RESEARCH_ROOT / file_path
    if not full_path.exists():
        return {"error": f"File not found: {file_path}"}
    return {"file_path": file_path, "content": full_path.read_text()}


def tool_suggest_code_change(
    file_path: str, original: str, replacement: str, explanation: str, **kwargs,
) -> dict:
    error = _validate_write_path(file_path)
    if error:
        return {"error": error}
    full_path = RESEARCH_ROOT / file_path
    if not full_path.exists():
        return {"error": f"File not found: {file_path}"}
    content = full_path.read_text()
    if original not in content:
        return {"error": "Original snippet not found in file"}
    return {
        "file_path": file_path,
        "original": original,
        "replacement": replacement,
        "explanation": explanation,
        "status": "pending_approval",
    }


def _fuzzy_replace(content: str, original: str, replacement: str) -> str | None:
    """Try exact match, then progressively fuzzier matches. Returns new content or None."""
    # 1. Exact match.
    if original in content:
        return content.replace(original, replacement, 1)

    # 2. Strip trailing whitespace per line on both sides.
    def _rstrip_lines(s: str) -> str:
        return '\n'.join(line.rstrip() for line in s.splitlines())

    content_stripped = _rstrip_lines(content)
    original_stripped = _rstrip_lines(original)
    if original_stripped in content_stripped:
        # Find the position in the original content and replace there.
        idx = content_stripped.find(original_stripped)
        # Map back to original content by counting lines.
        lines_before = content_stripped[:idx].count('\n')
        orig_lines = content.splitlines(keepends=True)
        orig_line_count = original.strip().count('\n') + 1
        start = lines_before
        end = start + orig_line_count
        return ''.join(orig_lines[:start]) + replacement + '\n' + ''.join(orig_lines[end:])

    # 3. Full whitespace normalization (strip each line).
    def _normalize(s: str) -> str:
        return '\n'.join(line.strip() for line in s.strip().splitlines())

    norm_original = _normalize(original)
    lines = content.splitlines(keepends=True)
    for i in range(len(lines)):
        for j in range(i + 1, min(i + len(original.splitlines()) + 10, len(lines) + 1)):
            candidate = ''.join(lines[i:j])
            if _normalize(candidate) == norm_original:
                return ''.join(lines[:i]) + replacement + '\n' + ''.join(lines[j:])
    return None


def tool_apply_code_change(
    file_path: str, original: str, replacement: str,
    session_id: str = "default", **kwargs,
) -> dict:
    """Apply a code change in an isolated worktree."""
    from playground_worktree import apply_via_worktree, read_file_from_worktree

    error = _validate_write_path(file_path)
    if error:
        return {"error": error}

    # Read from worktree if it exists (may have prior changes), else from main repo.
    content = read_file_from_worktree(file_path, session_id)
    if content is None:
        full_path = RESEARCH_ROOT / file_path
        if not full_path.exists():
            return {"error": f"File not found: {file_path}"}
        content = full_path.read_text()

    new_content = _fuzzy_replace(content, original, replacement)
    if new_content is None:
        return {"error": "Original snippet not found in file — may have already been applied or the code has changed"}

    return apply_via_worktree(file_path, new_content, session_id=session_id)


TOOL_DISPATCH: dict[str, Any] = {
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
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are an expert quantitative trading assistant embedded in the GNOME backtesting platform. You help users design, configure, run, and analyze HFT backtests.

You have access to tools that let you:
- List and read backtest presets (YAML configs)
- List available strategy classes and read their source code
- Edit backtest configs (strategy parameters, exchange settings, dates)
- Submit backtests and retrieve results
- Suggest code changes to strategy files (shown as diffs for user approval)

When helping users:
1. Start by understanding what they want to achieve
2. Check available strategies and data before configuring
3. After running a backtest, interpret the results — explain what the metrics mean and suggest improvements
4. Be specific about parameter changes and why they might help
5. When suggesting code changes, explain the reasoning

Key domain knowledge:
- Prices and sizes are in scaled integer units (divided by PRICE_SCALE and SIZE_SCALE)
- Adverse selection is the primary concern for market makers
- Sharpe ratios from short backtests should not be annualized
- Queue model (risk_averse vs probabilistic) significantly affects fill simulation
- Network latency and order processing latency affect execution quality
- Preset YAML configs do NOT include start_date/end_date — you MUST add them before submitting a backtest
- Always ask the user for a date range or use a sensible default (e.g. 30 minutes of recent data)

Code change workflow:
- ALWAYS call read_strategy_code BEFORE suggesting changes — never guess what the code looks like
- The original snippet in suggest_code_change MUST be copied exactly from the read_strategy_code result — character for character, including indentation
- When the user clicks Apply, the change is committed to an isolated git worktree branch. The result includes the branch name and commit SHA.
- To run a backtest with modified code, pass the branch name from apply_code_change as research_commit to submit_backtest
- ONLY set research_commit if you received a branch name from a previous apply_code_change in this conversation
- Do NOT set research_commit if no code changes have been applied — omit the field entirely
- Track the branch name from apply results and reuse it for all subsequent backtest submissions
- Do NOT tell the user they need to merge or switch branches — the system handles everything
"""

# ---------------------------------------------------------------------------
# Chat endpoint
# ---------------------------------------------------------------------------

ALLOWED_MODELS = {
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-6-20250514",
    "claude-opus-4-6-20250514",
}
DEFAULT_MODEL = "claude-haiku-4-5-20251001"


def handle_chat(
    conversation: list[dict],
    config: str | None = None,
    model: str | None = None,
    system_prompt: str | None = None,
) -> dict:
    """Process a chat turn with Claude, executing any tool calls.

    Args:
        conversation: List of message dicts with 'role' and 'content'.
        config: Current YAML config (injected into system prompt context).
        model: Claude model to use. Must be in ALLOWED_MODELS.
        system_prompt: Custom system prompt. Falls back to SYSTEM_PROMPT if not provided.

    Returns:
        Dict with 'messages' (new messages to append) and optionally
        'config_updates', 'code_suggestions'.
    """
    if model and model not in ALLOWED_MODELS:
        model = DEFAULT_MODEL
    model = model or DEFAULT_MODEL

    client = anthropic.Anthropic(
        api_key=os.environ.get("ANTHROPIC_API_KEY"),
    )

    system = (system_prompt or "") + "\n\n" + SYSTEM_PROMPT
    if config:
        system += f"\n\nCurrent backtest config:\n```yaml\n{config}\n```"

    new_messages = []
    config_updates = None
    code_suggestions = []

    # Initial call to Claude.
    response = client.messages.create(
        model=model,
        max_tokens=4096,
        system=system,
        tools=TOOLS,
        messages=conversation,
    )

    # Process response — handle tool use loops.
    while response.stop_reason == "tool_use":
        # Collect assistant message (may contain text + tool_use blocks).
        assistant_content = []
        for block in response.content:
            if block.type == "text":
                assistant_content.append({"type": "text", "text": block.text})
            elif block.type == "tool_use":
                assistant_content.append({
                    "type": "tool_use",
                    "id": block.id,
                    "name": block.name,
                    "input": block.input,
                })

        new_messages.append({"role": "assistant", "content": assistant_content})

        # Execute tool calls.
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

            # Track side effects.
            if block.name == "edit_config" and "error" not in result:
                config_updates = result.get("applied_updates")
            if block.name == "suggest_code_change" and result.get("status") == "pending_approval":
                code_suggestions.append(result)

            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": json.dumps(result),
            })

        new_messages.append({"role": "user", "content": tool_results})

        # Continue conversation with tool results.
        full_conversation = conversation + new_messages
        response = client.messages.create(
            model=model,
            max_tokens=4096,
            system=system,
            tools=TOOLS,
            messages=full_conversation,
        )

    # Final text response.
    final_text = ""
    for block in response.content:
        if block.type == "text":
            final_text += block.text

    new_messages.append({"role": "assistant", "content": final_text})

    return {
        "messages": new_messages,
        "config_updates": config_updates,
        "code_suggestions": code_suggestions,
    }


def handle_chat_streaming(
    conversation: list[dict],
    config: str | None = None,
    model: str | None = None,
    system_prompt: str | None = None,
):
    """Like handle_chat but yields events as they happen for SSE streaming."""
    if model and model not in ALLOWED_MODELS:
        model = DEFAULT_MODEL
    model = model or DEFAULT_MODEL

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    system = (system_prompt or "") + "\n\n" + SYSTEM_PROMPT
    if config:
        system += f"\n\nCurrent backtest config:\n```yaml\n{config}\n```"

    new_messages: list[dict] = []

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
                assistant_content.append({
                    "type": "tool_use", "id": block.id,
                    "name": block.name, "input": block.input,
                })

        msg = {"role": "assistant", "content": assistant_content}
        new_messages.append(msg)
        # Stream the assistant message immediately.
        yield {"type": "message", "message": msg}

        # Execute tool calls.
        tool_results = []
        code_suggestions = []
        config_updates = None

        for block in response.content:
            if block.type != "tool_use":
                continue

            # Stream that we're executing a tool.
            yield {"type": "tool_start", "name": block.name}

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
                yield {"type": "config_update", "updates": config_updates}
            if block.name == "suggest_code_change" and result.get("status") == "pending_approval":
                code_suggestions.append(result)
                yield {"type": "code_suggestion", "suggestion": result}

            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": json.dumps(result),
            })

        tool_msg = {"role": "user", "content": tool_results}
        new_messages.append(tool_msg)

        full_conversation = conversation + new_messages
        response = client.messages.create(
            model=model, max_tokens=4096, system=system,
            tools=TOOLS, messages=full_conversation,
        )

    # Final text response.
    final_text = ""
    for block in response.content:
        if block.type == "text":
            final_text += block.text

    final_msg = {"role": "assistant", "content": final_text}
    new_messages.append(final_msg)
    yield {"type": "message", "message": final_msg}
