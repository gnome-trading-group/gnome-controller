"""Anthropic Claude LLM client."""
from __future__ import annotations

import anthropic

from agent.core import LLMResponse, ToolCall


class AnthropicClient:
    """LLMClient implementation for Anthropic's Claude API."""

    def __init__(self, api_key: str):
        self._client = anthropic.Anthropic(api_key=api_key)

    def chat(
        self,
        model: str,
        system: str,
        messages: list[dict],
        tools: list[dict],
        max_tokens: int = 4096,
    ) -> LLMResponse:
        response = self._client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            tools=tools,
            messages=messages,
        )

        text_blocks = []
        tool_calls = []

        for block in response.content:
            if block.type == "text":
                text_blocks.append(block.text)
            elif block.type == "tool_use":
                tool_calls.append(ToolCall(
                    id=block.id,
                    name=block.name,
                    input=block.input,
                ))

        return LLMResponse(
            text_blocks=text_blocks,
            tool_calls=tool_calls,
            stop_reason="tool_use" if response.stop_reason == "tool_use" else "end_turn",
        )
