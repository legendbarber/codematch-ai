# CodeMatchAA System Design

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
  |-- Multi-agent analyzer
  |   |-- Analysis planner
  |   |-- Parallel analysis agents
  |   |-- Report writer / merger
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
3. User selects the default provider and may enter OpenAI and/or Gemini API keys.
4. User selects the comparison basis: uploaded document latest, GitHub code latest, or unknown.
5. User may enter OpenAI and/or Gemini API keys for this request.
6. Server creates an `Analysis` row and step rows in Supabase.
7. Analysis runner validates the URL, collects repository files, parses documents, chunks code, creates an analysis plan from document/structure signals, runs two independent analysis agents, merges them through the report writer, stores findings, and records analysis scope.
8. In `document_latest` mode, text PDF evidence is mapped to PDF text item coordinates. If mapping succeeds, all mapped findings for the same source PDF are written into one combined highlighted copy of the uploaded source PDF and stored as a generated artifact.
9. Browser polls `GET /api/analyses/:id` and renders progress, basis-specific result sections, downloadable artifacts, and final report data.

## API Interfaces

### `POST /api/analyses`

Creates an analysis job.

Input:

- `repoUrl`: public GitHub repository URL.
- `provider`: `openai` or `gemini`.
- `comparisonBasis`: `document_latest`, `code_latest`, or `unknown`.
- `openaiApiKey`: optional OpenAI API key for one request only.
- `geminiApiKey`: optional Gemini API key for one request only.
- `missingFeature`: boolean string.
- `apiMismatch`: boolean string.
- `outdatedDoc`: boolean string.
- `documents`: uploaded document files.

Output:

- `202 Accepted`
- Analysis summary with `id`, repo metadata, provider, status, totals, and timestamps.

Security note:

- Provider API keys are not stored in the database.
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
- Multi-agent analysis planning
- Two-agent parallel comparison
- Report writer agent final report generation
- Result persistence and artifact generation

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

## Multi-Agent Provider Design

The analyzer supports `openai` and `gemini` through separate adapters and a shared report schema. The runtime now follows the `multi-agent-docs/` design:

1. Before the planning-agent provider call, the server reads `multi-agent-docs/agents/analysis-planner-agent.md`, `multi-agent-docs/multi-agent-workflow.md`, and `multi-agent-docs/output-contracts.md` through an allowlisted loader and injects the loaded content into the prompt. The planning agent then creates an analysis plan from repository structure, document chunks, endpoint signals, comparison basis, and selected detection types.
2. Before each analysis-agent provider call, the server reads `multi-agent-docs/agents/analysis-agent.md`, `multi-agent-docs/hallucination-mitigation.md`, `multi-agent-docs/output-contracts.md`, and the required Markdown standards from `multi-agent-docs/detection-types/`. The loaded content is injected into the prompt so role, anti-hallucination policy, output contract, and detection criteria are runtime inputs instead of duplicated prompt constants.
3. Two independent analysis agents run against the same plan, loaded prompt documents, loaded detection standards, and evidence. Code chunks are selected from `analysisPlan.targetAreas[].candidatePaths` first, including exact file, directory, and simple glob matches. If candidate paths do not cover enough collected code, keyword-ranked supplement chunks are added before falling back to the first collected chunks.
4. Before the report-writer provider call, the server reads `multi-agent-docs/agents/report-writer-agent.md`, `multi-agent-docs/hallucination-mitigation.md`, `multi-agent-docs/output-contracts.md`, and `multi-agent-docs/multi-agent-workflow.md`. Static endpoint/function validation candidates are added as a separate input source before this call, so the report writer agent decides whether to include, lower-confidence, or discard them. A deterministic merger remains as fallback only when provider keys are unavailable and heuristic fallback is enabled.

Provider key precedence:

1. Web request provider-specific API key.
2. Server environment variable.
3. Heuristic fallback when enabled and no provider key exists.

If both OpenAI and Gemini keys are available, one OpenAI analysis agent and one Gemini analysis agent run in parallel. If only one provider key is available, two independent calls use that provider. If a user provides an invalid API key, the provider error is returned instead of falling back. This avoids hiding real credential or billing issues.

Planning and report-writing agents use the selected default provider when that provider has a request key or environment key; otherwise they use the other available provider. Their outputs are passed to the next stage rather than being treated as local-only hints.

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
