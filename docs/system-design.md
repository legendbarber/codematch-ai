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
  |-- Artifact writer
  |
  +--> GitHub public API / raw files
  +--> OpenAI or Gemini API
  +--> Supabase Postgres via Prisma
  +--> Local artifact storage in development
```

The application runs as a Next.js app. UI and API routes live in `src/app`, while GitHub collection, parsing, AI analysis, and database persistence live in `src/server`.

## Main Data Flow

1. User enters a public GitHub repository URL.
2. User uploads one or more development documents.
3. User selects `openai` or `gemini`.
4. User selects the comparison basis: uploaded document latest, GitHub code latest, or unknown.
5. User may enter a provider API key for this request.
6. Server creates an `Analysis` row and step rows in Supabase.
7. Analysis runner validates the URL, collects repository files, parses documents, chunks code, calls the selected provider, validates the report schema, stores findings, and records analysis scope.
8. In `document_latest` mode, text PDF evidence is mapped to PDF text item coordinates. If mapping succeeds, all mapped findings for the same source PDF are written into one combined highlighted copy of the uploaded source PDF and stored as a generated artifact.
9. Browser polls `GET /api/analyses/:id` and renders progress, basis-specific result sections, downloadable artifacts, and final report data.

## API Interfaces

### `POST /api/analyses`

Creates an analysis job.

Input:

- `repoUrl`: public GitHub repository URL.
- `provider`: `openai` or `gemini`.
- `comparisonBasis`: `document_latest`, `code_latest`, or `unknown`.
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

Returns analysis detail, including comparison basis, documents metadata, steps, findings, generated artifact metadata, summary, totals, analysis scope, and errors.

### `GET /api/analyses/:analysisId/artifacts/:artifactId/download`

Downloads a generated artifact.

- Requires the anonymous session cookie to match the owning `Analysis.sessionId`.
- Returns `404` for missing or unauthorized artifacts.
- Returns `410` for expired artifacts.
- Uses sanitized `Content-Disposition` filenames and `private, no-store` cache headers.

### `POST /api/analyses/:analysisId/findings/:findingId/documentation-draft`

Generates a Gemini documentation addition draft for a code-latest finding.

- Allowed only when `Analysis.comparisonBasis` is `code_latest`.
- Allowed only for `outdated_doc` findings because `code_latest` reports repository-only implemented features that are missing from the uploaded document.
- Uses server `GEMINI_API_KEY` or a request-time `apiKey`.
- Request-time keys are not stored.
- The validated draft JSON is stored in `DocumentationDraft` for audit/reuse.

## Database Model

The app uses Prisma with Supabase Postgres.

### `Analysis`

Stores analysis metadata:

- session ID
- repository URL and owner/name
- selected provider
- comparison basis
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
- document evidence location JSON
- code locations JSON

### `GeneratedArtifact`

Stores generated file metadata only:

- analysis ID
- optional finding ID
- artifact type, currently `highlighted_source_pdf_combined`
- sanitized file name
- MIME type
- storage key
- size
- expiration timestamp

The binary file is stored in the configured artifact storage, not in Prisma string/base64 columns.

### `DocumentationDraft`

Stores Gemini-generated documentation draft JSON linked to an analysis and finding.

## AI Provider Design

The analyzer supports `openai` and `gemini` through separate adapters and a shared report schema.

Provider key precedence:

1. Web request API key.
2. Server environment variable.
3. Heuristic fallback when enabled and no key exists.

If a user provides an invalid API key, the provider error is returned instead of falling back. This avoids hiding real credential or billing issues.

## Artifact And Storage Policy

Stored:

- Analysis metadata.
- Document file metadata.
- Progress step status.
- Finding evidence snippets and related file paths.
- Finding document/code location metadata.
- Generated artifact metadata.
- Documentation draft JSON.

Not stored:

- Uploaded original files.
- Full parsed document text.
- Full GitHub source code.
- Web-entered OpenAI/Gemini API keys.

Generated artifacts:

- Highlighted PDFs contain original source document content.
- Development uses local `var/artifacts`.
- Production defaults to disabled artifact storage unless an external object storage adapter is configured.
- Expired artifact metadata remains queryable but download returns an expiration error.

## Report Rendering And History

- The active report view renders `Analysis`, `UploadedDocument`, `AnalysisStep`, and `Finding` rows returned by `GET /api/analyses/:id`.
- After a new analysis is created, the browser loads that analysis detail and polls until completion.
- The history list is loaded from `GET /api/analyses`.
- Clicking a history item calls `GET /api/analyses/:id`, replaces the active report with that saved result, and scrolls to the report section.
- The `DB 저장 확인` panel on the report view shows the saved analysis ID, repository, provider, status, document metadata count, completed step count, finding count, and uploaded document metadata.
- The report body is always rendered when an analysis exists. If there are findings, it shows finding cards. If there are zero findings, it still shows a complete report with summary, metadata, scope, uploaded documents, a no-critical-mismatch result, and recommended next actions.
- Document-latest reports include a code reflection gap section and highlighted source PDF download controls when available.
- Code-latest reports include a "문서에 반영되지 않은 구현 기능" section and Gemini draft generation controls.

## Deployment Notes

- Local and cloud runtime both use Supabase Postgres.
- `DATABASE_URL` should use the Supabase transaction pooler with `pgbouncer=true`.
- `DIRECT_URL` should use the Supabase session pooler or direct DB URL for Prisma schema sync/migrations.
- For heavier workloads, move analysis execution from the web process to Cloud Tasks, Pub/Sub, or a worker process.
