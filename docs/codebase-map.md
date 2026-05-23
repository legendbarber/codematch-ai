# CodeMatch AI Codebase Map

This document explains the top-level folders and important root files in the
CodeMatch AI repository.

## Top-Level Folders

### `docs`

Project documentation and non-runtime reference assets.

- `docs/project-plan.md`: project goals, scope, milestones, current status, and risks.
- `docs/system-design.md`: architecture, API flow, database model, provider strategy, and report flow.
- `docs/db-verification.md`: SQL and API checks for verifying stored analysis data.
- `docs/deployment-gcp.md`: Google Cloud Run deployment notes.
- `docs/codebase-map.md`: this repository structure guide.
- `docs/assets/plan.pdf`: original project plan asset.
- `docs/assets/reference-ui.png`: UI direction reference image.

### `prisma`

Database schema files.

- `prisma/schema.prisma`: Prisma schema for `Analysis`, `UploadedDocument`, `AnalysisStep`, and `Finding`.

### `sample-fixtures`

Sample input data for validating CodeMatch behavior. These files are not used
by the production app at runtime.

- `sample-fixtures/teamflow-retailops/docs`: matching and intentionally mismatched technical documents.
- `sample-fixtures/teamflow-retailops/repos/implemented`: sample code intended to align with the TeamFlow RetailOps specification.
- `sample-fixtures/teamflow-retailops/repos/incomplete`: sample code with intentionally missing or mismatched features.

### `scripts`

Local operation scripts.

- `scripts/run-local.sh`: Linux/macOS local setup and dev server script.
- `scripts/run-local.ps1`: Windows PowerShell local setup and dev server script.

### `src`

Application source code.

- `src/app`: Next.js App Router pages, styles, layout, and API routes.
- `src/app/api/analyses`: API endpoints for creating, listing, and loading analyses.
- `src/server`: server-side business logic for repository collection, document parsing, analysis orchestration, report serialization, sessions, and validation.
- `src/server/analyzer`: OpenAI, Gemini, schema, prompt, and heuristic fallback analyzer modules.

### `tests`

Vitest unit tests for the production application code.

- `tests/github.test.ts`: GitHub URL parsing behavior.
- `tests/chunker.test.ts`: code chunking and endpoint signal extraction.
- `tests/document-parser.test.ts`: uploaded document parsing behavior.
- `tests/heuristic.test.ts`: local fallback analysis behavior.
- `tests/report-summary.test.ts`: report recommendation summary generation.

## Root Files

These files intentionally remain at the repository root because they are
standard entry points or tool configuration files.

- `README.md`: primary project overview and local setup guide.
- `AGENT.md`: local coding-agent guidance.
- `.env.example`: example environment variables.
- `.gitignore`: ignored local/generated files.
- `package.json`: npm scripts and dependencies.
- `package-lock.json`: locked npm dependency graph.
- `next.config.ts`: Next.js configuration.
- `next-env.d.ts`: Next.js TypeScript environment references.
- `tsconfig.json`: TypeScript compiler configuration.
- `vitest.config.ts`: Vitest test configuration.

## Generated Or Local-Only Folders

These may appear locally but should not be committed.

- `.next`
- `node_modules`
- `.tmp-npm-cache`
- `coverage`
- `dev.db`
