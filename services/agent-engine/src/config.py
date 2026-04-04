# Y-AIP Agent Engine — Settings
# All config via environment variables (12-factor)

from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Literal


class Settings(BaseSettings):
    # ── LLM ──────────────────────────────────────────────────────────
    litellm_mode: Literal["local", "cloud", "consensus"] = Field(
        default="local", description="local=Ollama, cloud=API, consensus=vote"
    )
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama4:scout"
    anthropic_api_key: str = ""
    openai_api_key: str = ""

    # ── MCP Gateway ──────────────────────────────────────────────────
    mcp_gateway_url: str = "http://localhost:4000"
    mcp_gateway_secret: str = "dev-secret-change-in-prod"

    # ── GraphQL API ───────────────────────────────────────────────────
    graphql_api_url: str = "http://localhost:4001/graphql"

    # ── Temporal ──────────────────────────────────────────────────────
    temporal_address: str = "localhost:7233"
    temporal_namespace: str = "default"
    temporal_task_queue: str = "actions"

    # ── Kafka ─────────────────────────────────────────────────────────
    kafka_brokers: str = "localhost:29092"
    schema_registry_url: str = "http://localhost:8081"

    # ── LLM Guard ────────────────────────────────────────────────────
    llm_guard_enabled: bool = True
    llm_guard_threshold: float = 0.7

    # ── Observability ────────────────────────────────────────────────
    langsmith_api_key: str = ""
    langsmith_project: str = "yaip-dev"
    otel_exporter_otlp_endpoint: str = "http://localhost:4317"

    # ── Server ───────────────────────────────────────────────────────
    agent_engine_port: int = 8000
    log_level: str = "INFO"
    deployment_mode: Literal["local", "cloud", "on_prem", "air_gap"] = "local"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
