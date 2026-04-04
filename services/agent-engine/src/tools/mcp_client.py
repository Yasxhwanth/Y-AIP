# Y-AIP Agent Engine — MCP Gateway Client
# All data access goes through the MCP Gateway (PBAC enforced there)
# Agents NEVER talk directly to databases

import httpx
import structlog
from typing import Any

from src.config import settings

log = structlog.get_logger(__name__)

# Shared async HTTP client (connection pooled)
_client: httpx.AsyncClient | None = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            base_url=settings.mcp_gateway_url,
            timeout=30.0,
            headers={
                "Content-Type": "application/json",
                # Agent identity token — issued by Keycloak for agent service accounts
                "Authorization": f"Bearer {settings.mcp_gateway_secret}",
            },
        )
    return _client


async def query(
    connector_id: str,
    sql: str,
    purpose_id: str,
    classification: str = "UNCLASSIFIED",
    data_markings: list[str] | None = None,
    params: dict[str, Any] | None = None,
    agent_id: str = "unknown",
) -> list[dict[str, Any]]:
    """
    Execute a federated query through the MCP Gateway.
    OPA PBAC is enforced on the gateway side.
    """
    client = get_client()

    payload = {
        "connector_id": connector_id,
        "query": sql,
        "purpose_id": purpose_id,
        "classification": classification,
        "data_markings": data_markings or [],
        **({"params": params} if params else {}),
    }

    log.info("mcp_query", agent_id=agent_id, connector=connector_id, purpose=purpose_id)

    response = await client.post("/mcp/query", json=payload)

    if response.status_code == 403:
        body = response.json()
        raise PermissionError(
            f"MCP Gateway denied query: {body.get('reasons', ['unknown reason'])}"
        )

    response.raise_for_status()
    data = response.json()

    log.info(
        "mcp_query_ok",
        agent_id=agent_id,
        rows=data.get("row_count", 0),
        masked_fields=data.get("masked_fields", []),
        latency_ms=data.get("latency_ms"),
    )

    return data.get("rows", [])


async def graphql_query(
    gql: str,
    variables: dict[str, Any] | None = None,
    agent_id: str = "unknown",
) -> dict[str, Any]:
    """
    Execute a GraphQL query against the Ontology API.
    Used for graph traversal and object relationship queries.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            settings.graphql_api_url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {settings.mcp_gateway_secret}",
            },
            json={"query": gql, "variables": variables or {}},
        )
        response.raise_for_status()
        result = response.json()

        if "errors" in result:
            log.error("graphql_error", agent_id=agent_id, errors=result["errors"])
            raise RuntimeError(f"GraphQL error: {result['errors']}")

        return result.get("data", {})
