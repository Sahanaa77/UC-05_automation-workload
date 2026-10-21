# =============================================================================
# Multi-stage Dockerfile for WorkloadLens (UC-05)
# Stage 1: Build the React TypeScript frontend
# Stage 2: Package the FastAPI backend with the static UI on port 8000
# =============================================================================

# --- Stage 1: Frontend Build ---
FROM node:20-alpine AS frontend-builder
WORKDIR /build

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# --- Stage 2: Backend & Runtime ---
FROM python:3.12-slim AS runner
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/pyproject.toml .
RUN pip install --no-cache-dir .[dev]

COPY backend/ .
COPY --from=frontend-builder /build/dist /app/frontend/dist

EXPOSE 8000

CMD ["uvicorn", "entitlesim.main:app", "--host", "0.0.0.0", "--port", "8000"]
