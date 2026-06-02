# CodeMatchAA

| 항목 | 내용 |
| --- | --- |
| Updated | 2026-05-23 |
| Updated By | lgs010704@gmail.com |

CodeMatchAA는 개발 기술문서와 공개 GitHub repository의 실제 코드를 비교해 기능 누락, API 불일치, 오래된 문서 가능성을 리포트로 보여주는 웹 애플리케이션입니다.

## 주요 기능

- GitHub repository URL 입력 및 공개 코드 수집
- PDF, Markdown, text, JSON, YAML 문서 업로드 및 parsing
- 분석 계획 에이전트, 병렬 분석 에이전트 2개, 문서 작성 에이전트 기반 문서-코드 정합성 분석
- OpenAI/Gemini API key를 모두 제공하면 서로 다른 provider 분석 에이전트 병렬 실행
- 분석 기준 선택: 업로드 문서 최신, GitHub 코드 최신, 기준 모름
- 탐지 유형은 선택한 분석 기준에 따라 자동 적용
- 문서 최신 모드에서 텍스트 PDF 근거 위치를 원본 PDF 복사본 하나에 통합 하이라이트한 artifact 다운로드
- 코드 최신 모드에서 레포지토리에만 있고 문서에는 없는 구현 기능만 코드 경로/API endpoint와 함께 표시
- 코드 최신 모드 finding별 Gemini 기반 문서 추가 초안 생성 및 복사
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

로컬 실행 스크립트는 Linux 파일 감시 한도에서 더 안정적으로 동작하도록 webpack dev server와 polling watcher를 사용합니다. Turbopack으로 실행하려면 `npm run dev:turbo`를 사용할 수 있지만, `OS file watch limit reached` 또는 `ENOSPC`가 나면 로컬 실행 스크립트를 사용하세요.

직접 실행 중 같은 watch limit 오류가 나면 다음처럼 polling 환경변수를 붙여 실행할 수 있습니다.

```bash
WATCHPACK_POLLING=true CHOKIDAR_USEPOLLING=true NEXT_WEBPACK_USEPOLLING=1 npm run dev:local
```

Windows에서 서버 종료 시 `Terminate batch job (Y/N)?`가 나오면 `Y`를 입력하고 Enter를 누르면 됩니다.

## AI Provider

- `openai`: `OPENAI_API_KEY`, `OPENAI_MODEL` 사용
- `gemini`: `GEMINI_API_KEY`, `GEMINI_MODEL` 사용
- 화면에서 입력한 OpenAI/Gemini API key는 해당 분석 요청 1회에만 사용하고 DB에 저장하지 않습니다.
- OpenAI와 Gemini key가 모두 있으면 OpenAI 분석 에이전트 1개와 Gemini 분석 에이전트 1개를 병렬 실행합니다.
- 한 provider key만 있으면 같은 provider 분석 에이전트 2개를 독립 호출합니다.
- API key가 없고 `ALLOW_HEURISTIC_FALLBACK=true`이면 로컬 heuristic 분석으로 동작합니다.
- 문서 추가 초안 생성은 Gemini를 사용합니다. 서버 `GEMINI_API_KEY`가 없으면 사용자가 초안 생성 요청 시점에 Gemini key를 입력해야 하며, 이 key도 DB에 저장하지 않습니다.

## Artifact Storage Policy

- 업로드 원본 문서는 분석 결과 DB에 저장하지 않습니다.
- 하이라이트 PDF 생성을 선택하고 매핑에 성공하면, 생성 artifact에는 원본 문서 내용이 포함됩니다. 한 분석의 여러 누락 근거는 가능한 경우 하나의 통합 하이라이트 PDF로 저장됩니다.
- 개발 환경에서는 `ARTIFACT_STORAGE_DRIVER=local`과 `LOCAL_ARTIFACT_DIR=./var/artifacts`로 임시 파일을 저장합니다.
- `ARTIFACT_RETENTION_DAYS` 기간이 지나면 다운로드 API는 만료 응답을 반환합니다. 실제 파일 정리는 운영 환경의 scheduled cleanup 정책으로 처리해야 합니다.
- production 기본값은 artifact storage disabled입니다. Cloud Run 같은 운영 환경에서 local filesystem은 revision 재시작/스케일아웃 시 보존되지 않으므로 사용하지 마세요.

## 새 환경변수

- `ARTIFACT_STORAGE_DRIVER`: `local` 또는 `disabled`. 미설정 시 개발/test는 `local`, production은 `disabled`.
- `LOCAL_ARTIFACT_DIR`: local artifact 저장 디렉터리.
- `ARTIFACT_RETENTION_DAYS`: artifact 다운로드 허용 기간.

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
