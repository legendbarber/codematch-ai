# CodeMatch AI Codebase Map

이 문서는 프로젝트의 폴더, 파일, 핵심 코드가 어떤 역할을 하는지 빠르게 파악하기 위한 구조 설명서다.

## Root Files

- `README.md`: 로컬 실행 방법, AI provider 설정, 프로젝트 문서 링크를 안내한다.
- `package.json`: npm scripts, Next.js/React/Prisma/Vitest 의존성을 정의한다.
- `.env.example`: Supabase, GitHub, OpenAI, Gemini 환경변수 예시를 제공한다.
- `tsconfig.json`: TypeScript strict 설정과 path alias를 정의한다.
- `next.config.ts`: Next.js 서버 패키지 설정을 정의한다.
- `vitest.config.ts`: 단위 테스트 실행 설정을 정의한다.
- `plan.pdf`: 최초 프로젝트 계획서 원본이다.
- `reference-ui.png`: UI 방향 참고 이미지다.

## `src/app`

Next.js App Router 영역이다. 화면과 API route가 위치한다.

- `src/app/layout.tsx`: 전체 HTML layout과 metadata를 정의한다.
- `src/app/globals.css`: 전체 UI 스타일, 반응형 레이아웃, 리포트/히스토리 컴포넌트 스타일을 정의한다.
- `src/app/page.tsx`: 메인 화면이다. Repository URL 입력, 문서 클릭/드래그앤드롭 업로드, AI provider/API key 입력, 분석 진행 상태, 결과 리포트, PDF/Markdown 리포트 다운로드, DB 저장 확인, 분석 히스토리를 렌더링한다.
- `src/app/api/analyses/route.ts`: `POST /api/analyses`와 `GET /api/analyses`를 처리한다. 분석 생성, 업로드 문서 수신, 익명 세션별 히스토리 조회를 담당한다.
- `src/app/api/analyses/[id]/route.ts`: `GET /api/analyses/:id`를 처리한다. Supabase에 저장된 분석 상세, 문서 메타데이터, 단계 로그, finding을 조회한다.

## `src/server`

UI와 분리된 서버 비즈니스 로직이다.

- `src/server/types.ts`: provider, finding, analysis status, repository snapshot, report 타입을 정의한다.
- `src/server/db.ts`: Prisma Client singleton을 생성한다.
- `src/server/session.ts`: 익명 세션 쿠키 생성과 쿠키 옵션을 정의한다.
- `src/server/validation.ts`: 분석 생성 요청의 Zod validation schema를 정의한다.
- `src/server/serializers.ts`: Prisma row를 API 응답 JSON 형태로 변환한다.
- `src/server/analysis-runner.ts`: 분석 전체 workflow를 orchestration한다. GitHub 수집, 문서 parsing, 코드 chunking, AI 분석, finding 저장, 단계 상태 업데이트를 담당한다.
- `src/server/github.ts`: GitHub URL 검증, GitHub API tree 조회, raw file 다운로드, 수집 대상 파일 필터링을 담당한다.
- `src/server/document-parser.ts`: 업로드 문서를 텍스트로 변환한다. PDF와 text/Markdown/JSON/YAML 계열을 지원한다.
- `src/server/chunker.ts`: 수집한 코드 파일을 모델 입력용 chunk로 나누고 API endpoint signal을 추출한다.

## `src/server/analyzer`

AI 기반 문서-코드 비교 분석 모듈이다.

- `src/server/analyzer/index.ts`: provider 선택 로직이다. OpenAI/Gemini adapter를 호출하고, API key가 없을 때 heuristic fallback을 사용한다.
- `src/server/analyzer/prompt.ts`: 업로드 문서, 코드 chunk, repository metadata를 하나의 분석 prompt로 구성한다.
- `src/server/analyzer/schema.ts`: AI 응답이 따라야 하는 공통 report schema와 validation 로직을 정의한다.
- `src/server/analyzer/openai.ts`: OpenAI Responses API를 호출하고 JSON schema 기반 리포트를 받는다.
- `src/server/analyzer/gemini.ts`: Gemini `generateContent` API를 호출하고 response schema 기반 리포트를 받는다.
- `src/server/analyzer/heuristic.ts`: API key가 없을 때 endpoint/keyword 기반으로 최소 분석 결과를 생성하는 fallback이다.

## `prisma`

데이터베이스 schema 영역이다.

- `prisma/schema.prisma`: Supabase Postgres용 Prisma schema다. `Analysis`, `UploadedDocument`, `AnalysisStep`, `Finding` 모델을 정의한다.

## `docs`

사용자와 발표/협업을 위한 프로젝트 산출물 문서다.

- `docs/project-plan.md`: 프로젝트 목표, 범위, 마일스톤, 현재 상태, 위험 요소를 정리한다.
- `docs/system-design.md`: 아키텍처, API, DB 모델, AI provider, 저장 정책, 리포트 렌더링 흐름을 설명한다.
- `docs/db-verification.md`: Supabase 저장 데이터와 리포트 조회를 확인하는 SQL/API 방법을 안내한다.
- `docs/deployment-gcp.md`: Google Cloud Run 배포와 Supabase/Cloud SQL 연결 참고 사항을 정리한다.
- `docs/codebase-map.md`: 현재 문서다. 폴더와 파일의 역할을 설명한다.

## `scripts`

로컬 실행 편의 스크립트다.

- `scripts/run-local.sh`: Linux/macOS용 실행 스크립트. 의존성 설치, Prisma client 생성, DB schema sync, dev server 실행을 수행한다.
- `scripts/run-local.ps1`: Windows PowerShell용 실행 스크립트. Linux/macOS 스크립트와 같은 작업을 수행한다.

서버 종료:

- Linux/macOS: 서버를 실행한 터미널에서 `Ctrl + C`.
- Windows PowerShell: 서버를 실행한 터미널에서 `Ctrl + C`, 종료 확인이 뜨면 `Y` 입력 후 Enter.

## `tests`

Vitest 단위 테스트다.

- `tests/github.test.ts`: GitHub URL parsing과 비-GitHub URL reject 동작을 검증한다.
- `tests/chunker.test.ts`: 코드 chunking과 endpoint signal 추출을 검증한다.
- `tests/heuristic.test.ts`: API key가 없을 때 동작하는 fallback 분석 finding 생성을 검증한다.

## Data Flow Summary

1. 사용자가 `src/app/page.tsx`에서 Repository URL, 문서 파일, provider/API key를 입력한다. 문서는 파일 선택 또는 드래그앤드롭으로 추가할 수 있다.
2. `src/app/api/analyses/route.ts`가 요청을 받아 `Analysis` row와 단계 row를 생성한다.
3. `src/server/analysis-runner.ts`가 분석 workflow를 실행한다.
4. `src/server/github.ts`가 GitHub 공개 저장소 코드를 수집한다.
5. `src/server/document-parser.ts`가 업로드 문서를 parsing한다.
6. `src/server/chunker.ts`가 코드 chunk와 endpoint signal을 만든다.
7. `src/server/analyzer/*`가 OpenAI/Gemini 또는 heuristic fallback으로 리포트를 만든다.
8. `analysis-runner.ts`가 finding과 summary를 Supabase에 저장한다.
9. `GET /api/analyses/:id`가 저장된 데이터를 다시 읽어 리포트 UI에 표시한다.
10. 사용자는 화면에 로드된 리포트를 PDF 저장용 인쇄 화면으로 열거나 Markdown 파일로 로컬에 다운로드할 수 있다.

## Storage Summary

저장하는 데이터:

- 분석 메타데이터
- 업로드 문서 파일명/크기/추출 글자 수
- 분석 단계 상태와 소요 시간
- 리포트 summary, finding, evidence snippet, 관련 파일 경로

저장하지 않는 데이터:

- 업로드 원본 파일
- 문서 전체 원문
- GitHub 코드 전체
- 웹에서 입력한 OpenAI/Gemini API key
