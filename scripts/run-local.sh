#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install Node.js 20+ first." >&2
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

if [ ! -f ".env" ]; then
  echo ".env was not found. Creating it from .env.example."
  cp .env.example .env
  echo "Edit .env and set DATABASE_URL and DIRECT_URL before running again." >&2
  exit 1
fi

echo "Generating Prisma client..."
npm run db:generate

echo "Syncing Prisma schema to database..."
npm run db:push

export WATCHPACK_POLLING=true
export CHOKIDAR_USEPOLLING=true
export NEXT_WEBPACK_USEPOLLING=1

echo "Starting CodeMatchAA with polling file watcher at http://127.0.0.1:3000"
npm run dev:local
