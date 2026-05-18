# CodeMatch AI

AI 기반 개발 문서-코드 정합성 검증 웹 베타입니다. 공개 GitHub Repository와 업로드한 개발 문서를 비교해 기능 누락, API 불일치, outdated 문서 가능성을 리포트로 제공합니다.

## Local Server

### Linux / macOS

```bash
chmod +x scripts/run-local.sh
./scripts/run-local.sh
```

### Windows PowerShell

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-local.ps1
```

Both scripts install dependencies if needed, generate the Prisma client, sync the Supabase schema, and start the local dev server at <http://127.0.0.1:3000>.

If `.env` does not exist, the script creates it from `.env.example` and stops. Set `DATABASE_URL` and `DIRECT_URL`, then run the script again.

### Manual Setup

```bash
npm install
cp .env.example .env
npm run db:push
npm run dev:local
```

Set `DATABASE_URL` to the Supabase transaction pooler URL and `DIRECT_URL` to the session pooler or direct database URL before running `db:push`.

Open <http://localhost:3000>.

## AI Providers

- `openai`: `OPENAI_API_KEY`와 `OPENAI_MODEL`을 사용합니다.
- `gemini`: `GEMINI_API_KEY`와 `GEMINI_MODEL`을 사용합니다.
- 화면에서 API key를 직접 입력하면 해당 분석 요청 1회에만 사용합니다.
- API key가 없고 `ALLOW_HEURISTIC_FALLBACK=true`이면 로컬 휴리스틱 분석기로 개발/시연을 계속할 수 있습니다.

입력한 API key는 데이터베이스에 저장하지 않습니다.

## Deployment

1차 실행부터 Supabase Postgres를 사용합니다. Google Cloud 배포는 Cloud Run + 외부 Postgres 연결 구성을 권장하며, 전환 절차는 [docs/deployment-gcp.md](./docs/deployment-gcp.md)에 정리되어 있습니다.

## Project Docs

- [Project Plan](./docs/project-plan.md)
- [System Design](./docs/system-design.md)
- [DB Verification Guide](./docs/db-verification.md)
- [Google Cloud Deployment Notes](./docs/deployment-gcp.md)

### API Keys
gemini : AIzaSyBOLnYB0SGatpLjS2IczZ7xi383FY5U8mk