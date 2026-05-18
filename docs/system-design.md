# CodeMatch AI System Design

## Architecture

```text
Browser
  |
  | multipart/form-data
  v
Next.js App Router
  |-- UI: src/app/page.tsx
  |-- API: src/app/api/analyses
  |
  v
Analysis Runner
  |-- GitHub collector
  |-- Document parser
  |-- Code chunker
  |-- AI analyzer
  |-- Report writer
  |
  +--> GitHub public API / raw files
  +--> OpenAI or Gemini API
  +--> Supabase Postgres via Prisma
```

The application runs as a Next.js app. UI and API routes live in `src/app`, while GitHub collection, parsing, AI analysis, and database persistence live in `src/server`.

## Main Data Flow

1. User enters a public GitHub repository URL.
2. User uploads one or more development documents.
3. User selects `openai` or `gemini`.
4. User may enter a provider API key for this request.
5. Server creates an `Analysis` row and step rows in Supabase.
6. Analysis runner validates the URL, collects repository files, parses documents, chunks code, calls the selected provider, validates the report schema, and stores findings.
7. Browser polls `GET /api/analyses/:id` and renders progress and final results.

## API Interfaces

### `POST /api/analyses`

Creates an analysis job.

Input:

- `repoUrl`: public GitHub repository URL.
- `provider`: `openai` or `gemini`.
- `apiKey`: optional provider API key for one request only.
- `missingFeature`: boolean string.
- `apiMismatch`: boolean string.
- `outdatedDoc`: boolean string.
- `documents`: uploaded document files.

Output:

- `202 Accepted`
- Analysis summary with `id`, repo metadata, provider, status, totals, and timestamps.

Security note:

- `apiKey` is not stored in the database.
- Uploaded original document content is not stored in the database.

### `GET /api/analyses`

Returns the latest 20 analyses for the current anonymous session.

### `GET /api/analyses/:id`

Returns analysis detail, including documents metadata, steps, findings, summary, totals, and errors.

## Database Model

The app uses Prisma with Supabase Postgres.

### `Analysis`

Stores analysis metadata:

- session ID
- repository URL and owner/name
- selected provider
- options JSON
- status
- summary
- totals JSON
- error
- timestamps

### `UploadedDocument`

Stores uploaded document metadata:

- file name
- MIME type
- file size
- extracted character count

It does not store original document content.

### `AnalysisStep`

Stores progress state for:

- Repository URL check
- GitHub code collection
- Document parsing
- AI comparison
- Report generation

### `Finding`

Stores report items:

- finding type
- severity
- title
- document evidence snippet
- code evidence snippet
- related file paths
- recommendation
- confidence

## AI Provider Design

The analyzer supports `openai` and `gemini` through separate adapters and a shared report schema.

Provider key precedence:

1. Web request API key.
2. Server environment variable.
3. Heuristic fallback when enabled and no key exists.

If a user provides an invalid API key, the provider error is returned instead of falling back. This avoids hiding real credential or billing issues.

## Storage Policy

Stored:

- Analysis metadata.
- Document file metadata.
- Progress step status.
- Finding evidence snippets and related file paths.

Not stored:

- Uploaded original files.
- Full parsed document text.
- Full GitHub source code.
- Web-entered OpenAI/Gemini API keys.

## Deployment Notes

- Local and cloud runtime both use Supabase Postgres.
- `DATABASE_URL` should use the Supabase transaction pooler with `pgbouncer=true`.
- `DIRECT_URL` should use the Supabase session pooler or direct DB URL for Prisma schema sync/migrations.
- For heavier workloads, move analysis execution from the web process to Cloud Tasks, Pub/Sub, or a worker process.
