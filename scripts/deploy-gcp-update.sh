#!/usr/bin/env bash
set -Eeuo pipefail

# Use this after the first successful deployment when only app code/version changed.
PROJECT_ID="${PROJECT_ID:-knudc-mangi2703}"
REGION="${REGION:-asia-northeast3}"
SERVICE="${SERVICE:-codematch-ai}"

DATABASE_SECRET="${DATABASE_SECRET:-codematch-database-url}"
DIRECT_SECRET="${DIRECT_SECRET:-codematch-direct-url}"

SOURCE_DIR="${SOURCE_DIR:-.}"
RUN_NPM_CI="${RUN_NPM_CI:-true}"
RUN_DB_PUSH="${RUN_DB_PUSH:-true}"

APP_ENV_VARS="${APP_ENV_VARS:-NODE_ENV=production,OPENAI_MODEL=gpt-5-mini,GEMINI_MODEL=gemini-2.5-flash,ALLOW_HEURISTIC_FALLBACK=true,ARTIFACT_STORAGE_DRIVER=disabled,ARTIFACT_RETENTION_DAYS=1}"
SECRET_MAPPINGS="${SECRET_MAPPINGS:-DATABASE_URL=${DATABASE_SECRET}:latest,DIRECT_URL=${DIRECT_SECRET}:latest}"

# Example:
# EXTRA_SECRET_MAPPINGS="OPENAI_API_KEY=codematch-openai-api-key:latest,GEMINI_API_KEY=codematch-gemini-api-key:latest"
EXTRA_SECRET_MAPPINGS="${EXTRA_SECRET_MAPPINGS:-}"

if [[ -n "$EXTRA_SECRET_MAPPINGS" ]]; then
  SECRET_MAPPINGS="${SECRET_MAPPINGS},${EXTRA_SECRET_MAPPINGS}"
fi

step() {
  printf '\n==> %s\n' "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

require_command gcloud
require_command npm

step "Configuring gcloud project"
gcloud config set project "$PROJECT_ID"

if [[ "$RUN_NPM_CI" == "true" ]]; then
  step "Installing dependencies"
  npm ci
fi

if [[ "$RUN_DB_PUSH" == "true" ]]; then
  step "Syncing Prisma schema to database"
  export DATABASE_URL="${DATABASE_URL:-$(gcloud secrets versions access latest --secret="$DATABASE_SECRET" --project "$PROJECT_ID")}"
  export DIRECT_URL="${DIRECT_URL:-$(gcloud secrets versions access latest --secret="$DIRECT_SECRET" --project "$PROJECT_ID")}"
  npm run db:push
fi

step "Deploying new Cloud Run revision"
gcloud run deploy "$SERVICE" \
  --source "$SOURCE_DIR" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --timeout=900 \
  --concurrency=10 \
  --min-instances=0 \
  --max-instances=5 \
  --no-cpu-throttling \
  --set-env-vars="$APP_ENV_VARS" \
  --update-secrets="$SECRET_MAPPINGS"

step "Deployment URL"
gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format="value(status.url)"
