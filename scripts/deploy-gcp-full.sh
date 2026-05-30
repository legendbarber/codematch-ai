#!/usr/bin/env bash
set -Eeuo pipefail

# Change these values when deploying to another Google Cloud project.
PROJECT_ID="${PROJECT_ID:-knudc-mangi2703}"
PROJECT_NUMBER="${PROJECT_NUMBER:-414706944277}"
REGION="${REGION:-asia-northeast3}"
SERVICE="${SERVICE:-codematch-ai}"

DATABASE_SECRET="${DATABASE_SECRET:-codematch-database-url}"
DIRECT_SECRET="${DIRECT_SECRET:-codematch-direct-url}"
RUN_SERVICE_ACCOUNT="${RUN_SERVICE_ACCOUNT:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"

SOURCE_DIR="${SOURCE_DIR:-.}"
RUN_DB_PUSH="${RUN_DB_PUSH:-true}"
ALLOW_PUBLIC="${ALLOW_PUBLIC:-true}"

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

ensure_secret_exists() {
  local secret_name="$1"
  if ! gcloud secrets describe "$secret_name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    printf 'Secret not found: %s\n' "$secret_name" >&2
    printf 'Create it first, for example:\n' >&2
    printf "  printf '%%s' 'YOUR_VALUE' | gcloud secrets create %s --replication-policy=automatic --data-file=-\n" "$secret_name" >&2
    exit 1
  fi
}

require_command gcloud
require_command npm

if [[ -z "$PROJECT_NUMBER" ]]; then
  step "Looking up project number"
  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")"
  RUN_SERVICE_ACCOUNT="${RUN_SERVICE_ACCOUNT:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"
fi

step "Configuring gcloud project"
gcloud config set project "$PROJECT_ID"

step "Enabling required Google Cloud APIs"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  --project "$PROJECT_ID"

step "Checking required Secret Manager secrets"
ensure_secret_exists "$DATABASE_SECRET"
ensure_secret_exists "$DIRECT_SECRET"

step "Granting Cloud Run runtime service account access to secrets"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

step "Installing dependencies"
npm ci

if [[ "$RUN_DB_PUSH" == "true" ]]; then
  step "Syncing Prisma schema to database"
  export DATABASE_URL="${DATABASE_URL:-$(gcloud secrets versions access latest --secret="$DATABASE_SECRET" --project "$PROJECT_ID")}"
  export DIRECT_URL="${DIRECT_URL:-$(gcloud secrets versions access latest --secret="$DIRECT_SECRET" --project "$PROJECT_ID")}"
  npm run db:push
fi

step "Deploying to Cloud Run"
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

if [[ "$ALLOW_PUBLIC" == "true" ]]; then
  step "Granting public Cloud Run invoker access"
  gcloud run services add-iam-policy-binding "$SERVICE" \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --member="allUsers" \
    --role="roles/run.invoker"
fi

step "Deployment URL"
gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format="value(status.url)"
