# Y-AIP Agent Engine — Dockerfile
FROM python:3.11-slim AS base

WORKDIR /app

# Install system deps for llm-guard (torch models)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
FROM base AS deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Production image
FROM deps AS runner
COPY src/ ./src/

EXPOSE 8000
HEALTHCHECK --interval=20s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
