$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RootDir

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error "npm is required. Install Node.js 20+ first."
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing dependencies..."
  npm install
}

if (-not (Test-Path ".env")) {
  Write-Host ".env was not found. Creating it from .env.example."
  Copy-Item ".env.example" ".env"
  Write-Error "Edit .env and set DATABASE_URL and DIRECT_URL before running again."
}

Write-Host "Generating Prisma client..."
npm run db:generate

Write-Host "Syncing Prisma schema to database..."
npm run db:push

Write-Host "Starting CodeMatch AI at http://127.0.0.1:3000"
npm run dev -- --hostname 127.0.0.1
