"""OpenAI LLM client."""
from __future__ import annotations

import json
import uuid

from agent.core import LLMResponse, ToolCall


class OpenAIClient:
    """LLMClient implementation for OpenAI's API."""

    def __init__(self, api_key: str):
        import openai
        self._client = openai.OpenAI(api_key=api_key)

    def chat(
        self,
        model: str,
        system: str,
        messages: list[dict],
        tools: list[dict],
        max_tokens: int = 4096,
    ) -> LLMResponse:
        # Convert Anthropic-style tools to OpenAI function calling format.
        openai_tools = [_convert_tool(t) for t in tools]

        # Convert messages: Anthropic uses tool_use/tool_result blocks,
        # OpenAI uses function_call/tool messages.
        openai_messages = [{"role": "system", "content": system}]
        openai_messages.extend(_convert_messages(messages))

        response = self._client.chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            messages=openai_messages,
            tools=openai_tools if openai_tools else None,
        )

        choice = response.choices[0]
        message = choice.message

        text_blocks = []
        tool_calls = []

        if message.content:
            text_blocks.append(message.content)

        if message.tool_calls:
            for tc in message.tool_calls:
                try:
                    args = json.loads(tc.function.arguments)
                except (json.JSONDecodeError, TypeError):
                    args = {}
                tool_calls.append(ToolCall(
                    id=tc.id,
                    name=tc.function.name,
                    input=args,
                ))

        stop_reason = "tool_use" if tool_calls else "end_turn"

        return LLMResponse(
            text_blocks=text_blocks,
            tool_calls=tool_calls,
            stop_reason=stop_reason,
        )


def _convert_tool(tool: dict) -> dict:
    """Convert Anthropic tool schema to OpenAI function calling format."""
    return {
        "type": "function",
        "function": {
            "name": tool["name"],
            "description": tool.get("description", ""),
            "parameters": tool.get("input_schema", {"type": "object", "properties": {}}),
        },
    }


def _convert_messages(messages: list[dict]) -> list[dict]:
    """Convert Anthropic-style messages to OpenAI format.

    Handles:
    - Simple text messages (pass through)
    - Assistant messages with tool_use blocks → assistant message with tool_calls
    - User messages with tool_result blocks → tool messages
    """
    result = []
    for msg in messages:
        role = msg["role"]
        content = msg["content"]

        if isinstance(content, str):
            result.append({"role": role, "content": content})
            continue

        if not isinstance(content, list):
            result.append({"role": role, "content": str(content)})
            continue

        # Assistant message with tool_use blocks.
        if role == "assistant":
            text_parts = []
            tool_calls = []
            for block in content:
                if block.get("type") == "text":
                    text_parts.append(block["text"])
                elif block.get("type") == "tool_use":
                    tool_calls.append({
                        "id": block["id"],
                        "type": "function",
                        "function": {
                            "name": block["name"],
                            "arguments": json.dumps(block["input"]),
                        },
                    })
            msg_dict: dict = {"role": "assistant"}
            if text_parts:
                msg_dict["content"] = "\n".join(text_parts)
            else:
                msg_dict["content"] = None
            if tool_calls:
                msg_dict["tool_calls"] = tool_calls
            result.append(msg_dict)
            continue

        # User message with tool_result blocks.
        if role == "user":
            has_tool_results = any(b.get("type") == "tool_result" for b in content if isinstance(b, dict))
            if has_tool_results:
                for block in content:
                    if block.get("type") == "tool_result":
                        result.append({
                            "role": "tool",
                            "tool_call_id": block["tool_use_id"],
                            "content": block.get("content", ""),
                        })
            else:
                text_parts = [b.get("text", "") for b in content if b.get("type") == "text"]
                result.append({"role": "user", "content": "\n".join(text_parts) or str(content)})

    return result
