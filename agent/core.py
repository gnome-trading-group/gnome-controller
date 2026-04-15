"""Gnomie agent core — shared tools, system prompt, and chat logic.

Used by both the dev server (with worktree adapter) and Lambda (with GitHub adapter).
Adapters must implement: read_file, apply_change, list_presets, get_preset,
submit_backtest, get_report_summary, list_strategies.
"""
from __future__ import annotations

import json
import os
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any, Protocol


# ---------------------------------------------------------------------------
# Adapter protocol — implemented differently for dev vs prod
# ---------------------------------------------------------------------------

class AgentAdapter(Protocol):
    def list_presets(self) -> dict: ...
    def get_preset(self, name: str) -> dict: ...
    def list_strategies(self) -> dict: ...
    def read_file(self, file_path: str, session_id: str) -> dict: ...
    def suggest_code_change(self, file_path: str, original: str, replacement: str, explanation: str) -> dict: ...
    def apply_code_change(self, file_path: str, original: str, replacement: str, session_id: str) -> dict: ...
    def submit_backtest(self, config: str, name: str, research_commit: str | None) -> dict: ...
    def get_report_summary(self, job_id: str) -> dict: ...


# ---------------------------------------------------------------------------
# LLM client protocol — provider-agnostic interface
# ---------------------------------------------------------------------------

@dataclass
class ToolCall:
    """A tool use request from the LLM."""
    id: str
    name: str
    input: dict


@dataclass
class LLMResponse:
    """Normalized response from any LLM provider."""
    text_blocks: list[str] = field(default_factory=list)
    tool_calls: list[ToolCall] = field(default_factory=list)
    stop_reason: str = "end_turn"  # "end_turn" or "tool_use"


class LLMClient(Protocol):
    """Protocol for LLM providers. Implement this to add a new provider."""

    def chat(
        self,
        model: str,
        system: str,
        messages: list[dict],
        tools: list[dict],
        max_tokens: int = 4096,
    ) -> LLMResponse: ...


def create_llm_client(
    model: str,
    api_keys: dict[str, str] | None = None,
) -> tuple[LLMClient, str]:
    """Create the appropriate LLM client based on model string.

    Accepts 'provider:model' format (e.g. 'anthropic:claude-haiku-4-5-20251001')
    or bare model names (defaults to Anthropic).

    ``api_keys`` is a dict of ``{provider: key}``. Falls back to env vars
    (``ANTHROPIC_API_KEY``, ``OPENAI_API_KEY``) if not provided.

    Returns (client, model_id) tuple.
    """
    if ":" in model:
        provider, model_id = model.split(":", 1)
    else:
        provider = "anthropic"
        model_id = model

    keys = api_keys or {}

    if provider == "anthropic":
        from agent.llms.anthropic import AnthropicClient
        key = keys.get("anthropic") or os.environ.get("ANTHROPIC_API_KEY", "")
        return AnthropicClient(api_key=key), model_id
    elif provider == "openai":
        from agent.llms.openai import OpenAIClient
        key = keys.get("openai") or os.environ.get("OPENAI_API_KEY", "")
        return OpenAIClient(api_key=key), model_id
    else:
        raise ValueError(f"Unknown LLM provider: {provider}. Supported: anthropic, openai")


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


def validate_read_path(file_path: str) -> str | None:
    if not any(file_path.startswith(p) for p in ALLOWED_READ_PATHS):
        return f"Access denied: can only read files in {ALLOWED_READ_PATHS}"
    return None


def validate_write_path(file_path: str) -> str | None:
    if not any(file_path.startswith(p) for p in ALLOWED_WRITE_PATHS):
        return f"Access denied: can only modify files in {ALLOWED_WRITE_PATHS}"
    return None


def validate_config_fields(updates: dict) -> str | None:
    for key in updates:
        top_key = key.split(".")[0]
        if top_key not in ALLOWED_CONFIG_FIELDS:
            return f"Cannot modify '{top_key}'. Allowed fields: {ALLOWED_CONFIG_FIELDS}"
    return None


# ---------------------------------------------------------------------------
# Fuzzy replace (for code changes)
# ---------------------------------------------------------------------------

def fuzzy_replace(content: str, original: str, replacement: str) -> str | None:
    """Try exact match, then progressively fuzzier matches."""
    if original in content:
        return content.replace(original, replacement, 1)

    def _rstrip_lines(s: str) -> str:
        return '\n'.join(line.rstrip() for line in s.splitlines())

    content_stripped = _rstrip_lines(content)
    original_stripped = _rstrip_lines(original)
    if original_stripped in content_stripped:
        idx = content_stripped.find(original_stripped)
        lines_before = content_stripped[:idx].count('\n')
        orig_lines = content.splitlines(keepends=True)
        orig_line_count = original.strip().count('\n') + 1
        return ''.join(orig_lines[:lines_before]) + replacement + '\n' + ''.join(orig_lines[lines_before + orig_line_count:])

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


# ---------------------------------------------------------------------------
# Tool definitions (Claude tool-use schema)
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "list_presets",
        "description": "List all available backtest preset names.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_preset",
        "description": "Get the YAML config for a specific preset by name.",
        "input_schema": {
            "type": "object",
            "properties": {"name": {"type": "string", "description": "Preset name (without .yaml)"}},
            "required": ["name"],
        },
    },
    {
        "name": "edit_config",
        "description": "Edit fields in the current backtest YAML config. Only strategy_args, exchanges, schema_type, start_date, end_date, and strategy can be modified.",
        "input_schema": {
            "type": "object",
            "properties": {"updates": {"type": "object", "description": "Key-value pairs to update."}},
            "required": ["updates"],
        },
    },
    {
        "name": "submit_backtest",
        "description": "Submit a backtest job. Config MUST include start_date and end_date. Always provide a descriptive name.",
        "input_schema": {
            "type": "object",
            "properties": {
                "config": {"type": "string", "description": "Complete YAML config including start_date and end_date"},
                "name": {"type": "string", "description": "Short descriptive name for this backtest run"},
                "research_commit": {"type": "string", "description": "Git commit SHA to run against. Only set if you have one from apply_code_change."},
            },
            "required": ["config", "name"],
        },
    },
    {
        "name": "get_report_summary",
        "description": "Get scalar metrics from a completed backtest report.",
        "input_schema": {
            "type": "object",
            "properties": {"job_id": {"type": "string"}},
            "required": ["job_id"],
        },
    },
    {
        "name": "list_strategies",
        "description": "List available strategy classes with their constructor parameters.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "read_strategy_code",
        "description": "Read the source code of a strategy or signal file. Accepts a file path (e.g. 'gnomepy_research/strategies/momentum.py') or an import path (e.g. 'gnomepy_research.strategies.momentum:MomentumTaker').",
        "input_schema": {
            "type": "object",
            "properties": {"file_path": {"type": "string", "description": "File path like 'gnomepy_research/strategies/momentum.py' or import path like 'gnomepy_research.strategies.momentum:MomentumTaker'"}},
            "required": ["file_path"],
        },
    },
    {
        "name": "suggest_code_change",
        "description": "Suggest a code change to a strategy file. Returns the diff for user approval.",
        "input_schema": {
            "type": "object",
            "properties": {
                "file_path": {"type": "string"},
                "original": {"type": "string", "description": "The original code snippet to replace"},
                "replacement": {"type": "string", "description": "The new code"},
                "explanation": {"type": "string", "description": "Brief explanation of the change"},
            },
            "required": ["file_path", "original", "replacement", "explanation"],
        },
    },
]


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are Gnomie, a quantitative trading assistant for the GNOME backtesting platform. You help users design, configure, run, and analyze HFT backtests.

You have tools to list presets, read strategies, edit configs, run backtests, and suggest code changes.

IMPORTANT: Always use your tools to get real data. NEVER guess or assume what presets, strategies, or files exist. Call list_presets, list_strategies, read_strategy_code etc. to get actual data.

When helping users:
1. Start by understanding what they want to achieve
2. ALWAYS call list_presets and list_strategies to see what's available — never say "no presets found" without calling the tool first
3. After running a backtest, interpret the results and suggest improvements
4. Be specific about parameter changes and why they might help

Key domain knowledge:
- Prices and sizes are in scaled integer units (divided by PRICE_SCALE and SIZE_SCALE)
- Adverse selection is the primary concern for market makers
- Sharpe ratios from short backtests should not be annualized
- Queue model (risk_averse vs probabilistic) significantly affects fill simulation
- Preset YAML configs do NOT include start_date/end_date — you MUST add them before submitting
- Always ask the user for a date range or use a sensible default

Code change workflow:
- ALWAYS call read_strategy_code BEFORE suggesting changes — never guess what the code looks like
- The original snippet MUST be copied exactly from the read_strategy_code result
- When the user clicks Apply, the change is committed to an isolated branch
- To run a backtest with modified code, pass the commit from apply results as research_commit
- ONLY set research_commit if you received one from a previous apply in this conversation
- Do NOT set research_commit if no code changes have been applied — omit it entirely
"""


# ---------------------------------------------------------------------------
# Conversation compression
# ---------------------------------------------------------------------------

def _sanitize_conversation(messages: list[dict]) -> list[dict]:
    """Ensure every tool_use has a matching tool_result.

    Drops trailing assistant messages with tool_use blocks that have no
    corresponding tool_result — happens when the user stops mid-request.
    """
    if not messages:
        return messages

    # Walk backwards — if the last message is an assistant with tool_use
    # blocks and there's no following user message with tool_results, drop it.
    sanitized = list(messages)
    while sanitized:
        last = sanitized[-1]
        if last.get("role") != "assistant":
            break
        if not isinstance(last.get("content"), list):
            break
        has_tool_use = any(
            b.get("type") == "tool_use" for b in last["content"] if isinstance(b, dict)
        )
        if not has_tool_use:
            break
        # This assistant message has tool_use blocks with no tool_result after it.
        sanitized.pop()
    return sanitized


def compress_conversation(messages: list[dict], keep_recent: int = 4) -> list[dict]:
    """Truncate tool results in older messages to save tokens."""
    compressed = []
    cutoff = len(messages) - keep_recent
    for i, msg in enumerate(messages):
        if i >= cutoff:
            compressed.append(msg)
            continue
        if msg.get("role") == "user" and isinstance(msg.get("content"), list):
            new_content = []
            for block in msg["content"]:
                if block.get("type") == "tool_result":
                    content = block.get("content", "")
                    if len(content) > 200:
                        content = content[:200] + "... (truncated)"
                    new_content.append({**block, "content": content})
                else:
                    new_content.append(block)
            compressed.append({**msg, "content": new_content})
        elif msg.get("role") == "assistant" and isinstance(msg.get("content"), list):
            new_content = []
            for block in msg["content"]:
                if block.get("type") == "tool_use":
                    inp = block.get("input", {})
                    inp_str = json.dumps(inp)
                    if len(inp_str) > 200:
                        new_content.append({**block, "input": {"_summary": inp_str[:200] + "..."}})
                    else:
                        new_content.append(block)
                else:
                    new_content.append(block)
            compressed.append({**msg, "content": new_content})
        else:
            compressed.append(msg)
    return compressed


# ---------------------------------------------------------------------------
# Chat handler
# ---------------------------------------------------------------------------

DEFAULT_MODEL = "anthropic:claude-haiku-4-5-20251001"


def _build_dispatch(adapter: AgentAdapter, session_id: str):
    """Build tool dispatch function with session_id auto-injected."""
    _SESSION_TOOLS = {"read_strategy_code", "suggest_code_change", "apply_code_change"}

    def dispatch(name: str, inputs: dict) -> dict:
        if name in _SESSION_TOOLS:
            inputs = {**inputs, "session_id": session_id}
        print(f"[gnomie] dispatch: {name}")

        if name == "list_presets":
            return adapter.list_presets()
        elif name == "get_preset":
            return adapter.get_preset(**inputs)
        elif name == "edit_config":
            error = validate_config_fields(inputs.get("updates", {}))
            if error:
                return {"error": error}
            return {"applied_updates": inputs["updates"], "status": "ok"}
        elif name == "submit_backtest":
            return adapter.submit_backtest(
                config=inputs["config"],
                name=inputs.get("name", "Gnomie backtest"),
                research_commit=inputs.get("research_commit"),
            )
        elif name == "get_report_summary":
            return adapter.get_report_summary(**inputs)
        elif name == "list_strategies":
            return adapter.list_strategies()
        elif name == "read_strategy_code":
            file_path = inputs["file_path"]
            # Convert import path format (e.g. gnomepy_research.strategies.momentum:MomentumTaker) to file path.
            if ":" in file_path:
                file_path = file_path.split(":")[0]
            if "." in file_path and "/" not in file_path:
                file_path = file_path.replace(".", "/") + ".py"
            print(f"[gnomie] read_strategy_code: {inputs['file_path']} → {file_path}")
            error = validate_read_path(file_path)
            if error:
                print(f"[gnomie] read_strategy_code DENIED: {error}")
                return {"error": error}
            print(f"[gnomie] calling adapter.read_file({file_path!r}, {inputs['session_id']!r})")
            print(f"[gnomie] adapter type: {type(adapter).__name__}")
            print(f"[gnomie] GH_TOKEN set: {bool(os.environ.get('GH_TOKEN'))}")
            try:
                result = adapter.read_file(file_path, inputs["session_id"])
            except Exception as e:
                print(f"[gnomie] read_strategy_code EXCEPTION: {e}")
                import traceback
                traceback.print_exc()
                return {"error": str(e)}
            if "error" in result:
                print(f"[gnomie] read_strategy_code ERROR: {result['error']}")
            else:
                print(f"[gnomie] read_strategy_code OK: {len(result.get('content', ''))} chars")
            return result
        elif name == "suggest_code_change":
            error = validate_write_path(inputs["file_path"])
            if error:
                return {"error": error}
            return adapter.suggest_code_change(**inputs)
        elif name == "apply_code_change":
            error = validate_write_path(inputs["file_path"])
            if error:
                return {"error": error}
            return adapter.apply_code_change(**inputs)
        return {"error": f"Unknown tool: {name}"}

    return dispatch


def _prepare_chat(
    model: str | None,
    system_prompt: str | None,
    config: str | None,
    api_keys: dict[str, str] | None,
):
    """Shared setup for handle_chat and handle_chat_stream."""
    model = model or DEFAULT_MODEL
    llm, model_id = create_llm_client(model, api_keys=api_keys)
    system = (system_prompt or "") + "\n\n" + SYSTEM_PROMPT
    if config:
        system += f"\n\nCurrent backtest config:\n```yaml\n{config}\n```"
    return llm, model_id, system


def handle_chat(
    adapter: AgentAdapter,
    conversation: list[dict],
    *,
    config: str | None = None,
    model: str | None = None,
    system_prompt: str | None = None,
    api_keys: dict[str, str] | None = None,
    session_id: str = "default",
) -> dict:
    """Process a chat turn, executing tool calls via the adapter."""
    llm, model_id, system = _prepare_chat(model, system_prompt, config, api_keys)
    dispatch = _build_dispatch(adapter, session_id)

    new_messages: list[dict] = []
    config_updates = None
    code_suggestions: list[dict] = []

    compressed = compress_conversation(_sanitize_conversation(conversation))
    response = llm.chat(model=model_id, system=system, messages=compressed, tools=TOOLS)

    while response.stop_reason == "tool_use":
        assistant_content = []
        for text in response.text_blocks:
            assistant_content.append({"type": "text", "text": text})
        for call in response.tool_calls:
            assistant_content.append({"type": "tool_use", "id": call.id, "name": call.name, "input": call.input})
        new_messages.append({"role": "assistant", "content": assistant_content})

        tool_results = []
        for call in response.tool_calls:
            try:
                result = dispatch(call.name, call.input)
            except Exception as e:
                result = {"error": str(e)}
            if call.name == "edit_config" and "error" not in result:
                config_updates = result.get("applied_updates")
            if call.name == "suggest_code_change" and result.get("status") == "pending_approval":
                code_suggestions.append(result)
            tool_results.append({"type": "tool_result", "tool_use_id": call.id, "content": json.dumps(result)})

        new_messages.append({"role": "user", "content": tool_results})
        response = llm.chat(model=model_id, system=system, messages=compress_conversation(_sanitize_conversation(conversation + new_messages)), tools=TOOLS)

    new_messages.append({"role": "assistant", "content": " ".join(response.text_blocks)})
    return {"messages": new_messages, "config_updates": config_updates, "code_suggestions": code_suggestions}


def handle_chat_stream(
    adapter: AgentAdapter,
    conversation: list[dict],
    *,
    config: str | None = None,
    model: str | None = None,
    system_prompt: str | None = None,
    api_keys: dict[str, str] | None = None,
    session_id: str = "default",
) -> Iterator[dict]:
    """Like handle_chat but yields SSE events as they happen."""
    llm, model_id, system = _prepare_chat(model, system_prompt, config, api_keys)
    dispatch = _build_dispatch(adapter, session_id)

    new_messages: list[dict] = []
    compressed = compress_conversation(_sanitize_conversation(conversation))
    response = llm.chat(model=model_id, system=system, messages=compressed, tools=TOOLS)

    while response.stop_reason == "tool_use":
        assistant_content = []
        for text in response.text_blocks:
            assistant_content.append({"type": "text", "text": text})
        for call in response.tool_calls:
            assistant_content.append({"type": "tool_use", "id": call.id, "name": call.name, "input": call.input})

        msg = {"role": "assistant", "content": assistant_content}
        new_messages.append(msg)
        yield {"type": "message", "message": msg}

        tool_results = []
        for call in response.tool_calls:
            yield {"type": "tool_start", "name": call.name}
            try:
                result = dispatch(call.name, call.input)
            except Exception as e:
                result = {"error": str(e)}
            if call.name == "edit_config" and "error" not in result:
                yield {"type": "config_update", "updates": result.get("applied_updates")}
            if call.name == "suggest_code_change" and result.get("status") == "pending_approval":
                yield {"type": "code_suggestion", "suggestion": result}
            tool_results.append({"type": "tool_result", "tool_use_id": call.id, "content": json.dumps(result)})

        tool_msg = {"role": "user", "content": tool_results}
        new_messages.append(tool_msg)
        # Yield tool results so the frontend keeps conversation state in sync.
        yield {"type": "message", "message": tool_msg}

        response = llm.chat(model=model_id, system=system, messages=compress_conversation(_sanitize_conversation(conversation + new_messages)), tools=TOOLS)

    final_msg = {"role": "assistant", "content": " ".join(response.text_blocks)}
    new_messages.append(final_msg)
    yield {"type": "message", "message": final_msg}
