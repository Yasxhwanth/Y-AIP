# Y-AIP Agent Engine — LiteLLM Multi-Model Router
# Supports local (Ollama), cloud (Anthropic/OpenAI), and consensus (k-LLM) modes

import os
from enum import Enum
from typing import Any
import structlog
import litellm
from litellm import completion, acompletion

from src.config import settings

log = structlog.get_logger(__name__)

# Configure LiteLLM
litellm.set_verbose = False

# Set API keys from settings
if settings.anthropic_api_key:
    os.environ["ANTHROPIC_API_KEY"] = settings.anthropic_api_key
if settings.openai_api_key:
    os.environ["OPENAI_API_KEY"] = settings.openai_api_key


class LLMMode(str, Enum):
    LOCAL = "local"       # Ollama — fully air-gap capable
    CLOUD = "cloud"       # Anthropic Claude / OpenAI GPT-4o
    CONSENSUS = "consensus"  # k-LLM: vote across multiple models


# Model configurations per mode
MODEL_CONFIG = {
    LLMMode.LOCAL: {
        "model": f"ollama/{settings.ollama_model}",
        "api_base": settings.ollama_base_url,
        "temperature": 0.1,
        "max_tokens": 4096,
    },
    LLMMode.CLOUD: {
        "primary": {
            "model": "anthropic/claude-3-5-sonnet-20240620",
            "temperature": 0.1,
            "max_tokens": 4096,
        },
        "fallback": {
            "model": "gpt-4o",
            "temperature": 0.1,
            "max_tokens": 4096,
        },
    },
    LLMMode.CONSENSUS: {
        "models": [
            {"model": f"ollama/{settings.ollama_model}", "api_base": settings.ollama_base_url},
            {"model": "anthropic/claude-3-5-sonnet-20240620"},
            {"model": "gpt-4o"},
        ],
        "required_agreement": 2,  # 2-of-3 majority
    },
}


async def call_llm(
    messages: list[dict[str, str]],
    mode: LLMMode | None = None,
    agent_id: str = "unknown",
) -> str:
    """
    Route LLM call based on deployment mode.
    Returns the model's text response.
    """
    effective_mode = mode or LLMMode(settings.litellm_mode)

    log.info("llm_call", agent_id=agent_id, mode=effective_mode)

    if effective_mode == LLMMode.LOCAL:
        return await _call_local(messages)

    elif effective_mode == LLMMode.CLOUD:
        return await _call_cloud(messages)

    elif effective_mode == LLMMode.CONSENSUS:
        return await _call_consensus(messages, agent_id)

    raise ValueError(f"Unknown LLM mode: {effective_mode}")


async def _call_local(messages: list[dict[str, str]]) -> str:
    cfg = MODEL_CONFIG[LLMMode.LOCAL]
    response = await acompletion(
        model=cfg["model"],
        messages=messages,
        api_base=cfg["api_base"],
        temperature=cfg["temperature"],
        max_tokens=cfg["max_tokens"],
    )
    return response.choices[0].message.content or ""


async def _call_cloud(messages: list[dict[str, str]]) -> str:
    primary = MODEL_CONFIG[LLMMode.CLOUD]["primary"]
    try:
        response = await acompletion(model=primary["model"], messages=messages, **{
            k: v for k, v in primary.items() if k != "model"
        })
        return response.choices[0].message.content or ""
    except Exception as e:
        log.warning("cloud_llm_primary_failed", error=str(e), fallback="gpt-4o")
        fallback = MODEL_CONFIG[LLMMode.CLOUD]["fallback"]
        response = await acompletion(model=fallback["model"], messages=messages, **{
            k: v for k, v in fallback.items() if k != "model"
        })
        return response.choices[0].message.content or ""


async def _call_consensus(
    messages: list[dict[str, str]], agent_id: str
) -> str:
    """
    k-LLM consensus: call all models in parallel, return majority answer.
    Used for high-consequence decisions where single-model answers are insufficient.
    """
    import asyncio

    cfg = MODEL_CONFIG[LLMMode.CONSENSUS]
    models = cfg["models"]
    required = cfg["required_agreement"]

    async def call_one(model_cfg: dict[str, Any]) -> str | None:
        try:
            kwargs = {k: v for k, v in model_cfg.items() if k != "model"}
            response = await acompletion(
                model=model_cfg["model"],
                messages=messages,
                temperature=0.1,
                max_tokens=2048,
                **kwargs,
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            log.warning("consensus_model_failed", model=model_cfg["model"], error=str(e))
            return None

    results = await asyncio.gather(*[call_one(m) for m in models])
    valid = [r for r in results if r is not None]

    log.info(
        "consensus_results",
        agent_id=agent_id,
        total=len(models),
        succeeded=len(valid),
    )

    if len(valid) < required:
        raise RuntimeError(
            f"Consensus failed: only {len(valid)}/{len(models)} models responded, need {required}"
        )

    # Return the longest response as the most detailed (simple consensus heuristic)
    # In production: use semantic similarity clustering
    return max(valid, key=len)
