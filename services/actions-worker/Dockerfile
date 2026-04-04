# Y-AIP Actions Worker — Dockerfile
FROM python:3.11-slim AS base

WORKDIR /app

# Install curl for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM deps AS runner
COPY src/ ./src/

EXPOSE 8002
HEALTHCHECK --interval=20s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8002/health || exit 1

CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8002"]
