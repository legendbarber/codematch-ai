# DB Verification Guide

CodeMatchAA stores report data in Supabase Postgres through Prisma. It does not store uploaded original files, full parsed document text, full GitHub source code, or web-entered AI API keys.

## What Should Be Stored

- `Analysis`: one row per analysis request.
- `UploadedDocument`: uploaded file metadata only.
- `AnalysisStep`: progress logs for each analysis stage.
- `Finding`: report findings and evidence snippets.

## Verify From The App

1. Run an analysis.
2. Open the `분석 결과` section.
3. Check the `DB 저장 확인` panel.
4. Click an item in `분석 히스토리`.
5. The app should load that previous analysis and scroll back to the report section.
6. Confirm that the report body is visible even when `Finding` is `0개 저장`.

The report page is rendered from `GET /api/analyses/:id`, which reads the saved rows from Supabase.

## Verify From API

Use the analysis ID shown in the `DB 저장 확인` panel.

```bash
curl -b /tmp/codematch-supabase-cookies.txt \
  http://127.0.0.1:3000/api/analyses/<analysis-id>
```

Expected response fields:

- `analysis.documents`: rows from `UploadedDocument`
- `analysis.steps`: rows from `AnalysisStep`
- `analysis.findings`: rows from `Finding`
- `analysis.totals`: parsed from `Analysis.totalsJson`

## Verify From Supabase SQL Editor

Recent analyses:

```sql
select
  "id",
  "sessionId",
  "repoOwner",
  "repoName",
  "provider",
  "status",
  "summary",
  "createdAt",
  "completedAt"
from "Analysis"
order by "createdAt" desc
limit 10;
```

Uploaded document metadata for one analysis:

```sql
select
  "name",
  "mimeType",
  "size",
  "extractedChars",
  "createdAt"
from "UploadedDocument"
where "analysisId" = '<analysis-id>'
order by "createdAt" asc;
```

Progress steps:

```sql
select
  "order",
  "label",
  "status",
  "message",
  "durationMs"
from "AnalysisStep"
where "analysisId" = '<analysis-id>'
order by "order" asc;
```

Report findings:

```sql
select
  "type",
  "severity",
  "title",
  "documentEvidence",
  "codeEvidence",
  "relatedFilesJson",
  "recommendation",
  "confidence"
from "Finding"
where "analysisId" = '<analysis-id>'
order by "createdAt" asc;
```

Check that API keys are not stored:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('Analysis', 'UploadedDocument', 'AnalysisStep', 'Finding')
  and column_name ilike '%key%'
  and not (table_name = 'AnalysisStep' and column_name = 'key');
```

Expected result: zero rows. `AnalysisStep.key` is a progress-step identifier, not an API key, so the query excludes it.
