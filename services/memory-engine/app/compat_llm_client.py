"""OpenAI-compatible LLM client that uses Chat Completions API instead of Responses API.

graphiti-core 0.28.x's OpenAIClient uses the new /v1/responses endpoint which is
only available on OpenAI. This client falls back to /v1/chat/completions for
providers like Kimi, DeepSeek, and OpenRouter.
"""

import json
import typing
import logging

from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam
from pydantic import BaseModel

from graphiti_core.llm_client.openai_client import OpenAIClient
from graphiti_core.llm_client.config import LLMConfig

logger = logging.getLogger("memory-engine")


class CompatOpenAIClient(OpenAIClient):
    """LLM client that uses Chat Completions API for all providers."""

    def __init__(self, config: LLMConfig | None = None, **kwargs: typing.Any):
        super().__init__(config=config, **kwargs)
        if config and config.base_url:
            self.client = AsyncOpenAI(api_key=config.api_key, base_url=config.base_url)

    async def _create_structured_completion(
        self,
        model: str,
        messages: list[ChatCompletionMessageParam],
        temperature: float | None,
        max_tokens: int,
        response_model: type[BaseModel],
        reasoning: str | None = None,
        verbosity: str | None = None,
    ):
        """Use Chat Completions with JSON schema instead of Responses API."""
        schema = response_model.model_json_schema()
        schema_str = json.dumps(schema, ensure_ascii=False)

        system_msg: ChatCompletionMessageParam = {
            "role": "system",
            "content": (
                f"You must respond with valid JSON matching this schema:\n{schema_str}\n"
                "Output ONLY the JSON object, no markdown fences, no extra text."
            ),
        }
        patched_messages = [system_msg] + list(messages)

        response = await self.client.chat.completions.create(
            model=model,
            messages=patched_messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )

        return _StructuredResponseShim(response, response_model)


class _StructuredResponseShim:
    """Shim matching the interface expected by BaseOpenAIClient._handle_structured_response.

    Graphiti's handler reads: response.output_text (str), response.usage.input_tokens/output_tokens
    """

    def __init__(self, chat_response: typing.Any, response_model: type[BaseModel]):
        self.output_text = chat_response.choices[0].message.content or "{}"
        self.usage = _UsageShim(chat_response.usage)


class _UsageShim:
    def __init__(self, usage: typing.Any):
        self.input_tokens = getattr(usage, "prompt_tokens", 0) or 0
        self.output_tokens = getattr(usage, "completion_tokens", 0) or 0
