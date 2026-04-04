import structlog
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # ── Temporal ──────────────────────────────────────────────────────
    temporal_address: str = "localhost:7233"
    temporal_namespace: str = "default"
    temporal_task_queue: str = "yaip-actions"

    # ── MCP Gateway ──────────────────────────────────────────────────
    mcp_gateway_url: str = "http://localhost:4000"
    mcp_gateway_secret: str = "dev-secret-change-in-prod"

    # ── Server ───────────────────────────────────────────────────────
    port: int = 8002
    log_level: str = "INFO"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_log_level,
        structlog.dev.ConsoleRenderer() if settings.log_level == "DEBUG" else structlog.processors.JSONRenderer(),
    ]
)
log = structlog.get_logger(__name__)
