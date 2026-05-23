# CodeMatch AI

| 항목 | 내용 |
| --- | --- |
| Updated | 2026-05-23 |
| Updated By | lgs010704@gmail.com |

CodeMatch AI는 개발 기술문서와 공개 GitHub repository의 실제 코드를 비교해 기능 누락, API 불일치, 오래된 문서 가능성을 리포트로 보여주는 웹 애플리케이션입니다.

## 주요 기능

- GitHub repository URL 입력 및 공개 코드 수집
- PDF, Markdown, text, JSON, YAML 문서 업로드 및 parsing
- OpenAI 또는 Gemini 기반 문서-코드 정합성 분석
- API key가 없을 때도 동작하는 heuristic fallback 분석
- 분석 진행 상태, finding, 권장 조치, 히스토리 표시
- Supabase Postgres 기반 분석 결과 저장

## 로컬 실행

### Linux / macOS

```bash
chmod +x scripts/run-local.sh
./scripts/run-local.sh
```

### Windows PowerShell

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-local.ps1
```

두 스크립트는 필요한 의존성을 설치하고, Prisma client를 생성하며, DB schema를 동기화한 뒤 로컬 개발 서버를 `http://127.0.0.1:3000`에서 실행합니다.

`.env`가 없으면 `.env.example`을 복사해 `.env`를 만든 뒤 중단합니다. `DATABASE_URL`과 `DIRECT_URL`을 설정한 다음 다시 실행하세요.

### 수동 실행

```bash
npm install
cp .env.example .env
npm run db:push
npm run dev:local
```

Windows에서 서버 종료 시 `Terminate batch job (Y/N)?`가 나오면 `Y`를 입력하고 Enter를 누르면 됩니다.

## AI Provider

- `openai`: `OPENAI_API_KEY`, `OPENAI_MODEL` 사용
- `gemini`: `GEMINI_API_KEY`, `GEMINI_MODEL` 사용
- 화면에서 입력한 API key는 해당 분석 요청 1회에만 사용하고 DB에 저장하지 않습니다.
- API key가 없고 `ALLOW_HEURISTIC_FALLBACK=true`이면 로컬 heuristic 분석으로 동작합니다.

## 폴더 구조

```text
docs/                 프로젝트 문서와 참고 자산
prisma/               Prisma DB schema
scripts/              로컬 실행 스크립트
src/                  Next.js 앱과 서버 분석 로직
test/
  automated-tests/    npm test로 실행되는 Vitest 자동화 테스트
  sample-inputs/      CodeMatch 수동 검증/시연용 샘플 문서와 샘플 코드
```

## Test Materials

- [Automated Tests](./test/automated-tests): CodeMatch 앱 자체의 동작을 검증하는 Vitest 테스트입니다.
- [Sample Inputs](./test/sample-inputs/teamflow-retailops): CodeMatch에 입력해볼 샘플 기술문서와 matching/incomplete 코드 repository fixture입니다.

## Project Docs

- [Project Plan](./docs/project-plan.md)
- [System Design](./docs/system-design.md)
- [Codebase Map](./docs/codebase-map.md)
- [DB Verification Guide](./docs/db-verification.md)
- [Google Cloud Deployment Notes](./docs/deployment-gcp.md)

## 배포 참고

현재 배포 기준 문서는 [Google Cloud Deployment Notes](./docs/deployment-gcp.md)에 정리되어 있습니다. 기본 구성은 Cloud Run과 Supabase Postgres 연동을 기준으로 합니다.
