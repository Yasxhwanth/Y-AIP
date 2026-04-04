# Y-AIP Agent Engine — LLM Guard (prompt injection scanner)
# Fully self-hosted, air-gap safe — no external API calls

import structlog
from llm_guard.input_scanners import PromptInjection, Jailbreak, Toxicity
from llm_guard import scan_prompt

from src.config import settings

log = structlog.get_logger(__name__)

# Initialize scanners once at module load (model loading takes a few seconds)
_scanners = None


def _get_scanners():
    global _scanners
    if _scanners is None:
        _scanners = [
            PromptInjection(threshold=settings.llm_guard_threshold),
            Jailbreak(threshold=settings.llm_guard_threshold),
            Toxicity(threshold=0.85),
        ]
    return _scanners


class GuardrailViolation(Exception):
    """Raised when LLM Guard detects a prompt injection or jailbreak attempt."""

    def __init__(self, violations: dict[str, float]):
        self.violations = violations
        super().__init__(f"Guardrail triggered: {violations}")


def scan_user_input(content: str, agent_id: str) -> str:
    """
    Scan user/agent input through LLM Guard before sending to LLM.
    Returns the (potentially sanitized) content if safe.
    Raises GuardrailViolation if injection/jailbreak detected.
    """
    if not settings.llm_guard_enabled:
        return content

    try:
        scanners = _get_scanners()
        sanitized, results_valid, results_score = scan_prompt(scanners, content)

        if not all(results_valid.values()):
            violations = {
                scanner: score
                for scanner, (valid, score) in zip(
                    [s.__class__.__name__ for s in scanners],
                    zip(results_valid.values(), results_score.values()),
                )
                if not valid
            }

            log.warning(
                "guardrail_triggered",
                agent_id=agent_id,
                violations=violations,
                content_preview=content[:100],
            )
            raise GuardrailViolation(violations)

        return sanitized

    except GuardrailViolation:
        raise
    except Exception as e:
        # LLM Guard unavailable — log loudly but do not block (degraded mode)
        log.error("llm_guard_error", error=str(e), agent_id=agent_id)
        return content
