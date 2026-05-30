# CodeMatch AI Project Plan

## Overview

CodeMatch AI는 개발 문서와 GitHub 공개 저장소의 실제 코드 간 정합성을 점검하는 웹 기반 베타 서비스다. 사용자는 Repository URL과 개발 문서를 입력하고, AI 기반 리포트로 기능 누락, API 불일치, outdated 문서 가능성을 확인한다.

## Goals

- 공개 GitHub 저장소와 업로드 문서를 비교해 문서-코드 정합성 의심 항목을 제공한다.
- OpenAI/Gemini를 단일 또는 병렬 분석 에이전트로 실행할 수 있는 멀티 에이전트 workflow를 제공한다.
- 사용자가 화면에서 provider별 API key를 입력해 환경변수 없이도 실제 AI 분석을 실행할 수 있게 한다.
- Supabase Postgres에 분석 히스토리와 리포트 결과를 저장한다.
- Google Cloud Run 배포로 확장 가능한 구조를 유지한다.
- 사용자가 문서 최신/코드 최신/기준 모름 중 분석 기준본을 명시하고, 기준본에 맞는 후속 작업을 바로 수행할 수 있게 한다.

## Scope

- GitHub 공개 저장소 URL 검증 및 코드 수집.
- Markdown, text, JSON/YAML, PDF 문서 업로드 및 parsing.
- 코드 파일 chunking과 endpoint/key signal 추출.
- provider 호출 기반 분석 계획 에이전트, 병렬 분석 에이전트 2개, 문서 작성 에이전트 기반 문서-코드 semantic 비교.
- API key가 없을 때 동작하는 로컬 휴리스틱 fallback.
- 익명 세션 기반 분석 히스토리, 진행 상태, 상세 리포트 UI.
- 분석 히스토리 클릭 시 이전 리포트 재조회 및 표시.
- 리포트 화면에서 Supabase 저장 상태 확인.
- finding이 0건이어도 요약, 메타 정보, 검토 범위, 업로드 문서, 권장 조치가 포함된 리포트 표시.
- 문서 최신 모드에서 텍스트 PDF 근거 위치를 매핑해 여러 누락 근거가 통합 하이라이트된 원본 PDF 복사본 생성 및 다운로드.
- 코드 최신 모드에서 레포지토리에만 있고 문서에는 없는 구현 기능을 코드 위치/API endpoint 기반 문서 누락 섹션으로 표시.
- Gemini 기반 문서 추가 초안 생성 및 복사.
- 분석 범위, GitHub tree truncation, PDF 하이라이트 매핑 실패 여부 표시.

## Non-Goals

- 비공개 저장소, GitHub App 설치, OAuth 로그인은 1차 범위에서 제외한다.
- AI finding을 정적 분석 수준의 확정 판정으로 제공하지 않는다.
- 업로드 원본 문서 파일, GitHub 코드 전체, 웹 입력 API key는 장기 저장하지 않는다.
- OCR 기반 스캔 PDF 하이라이트, Word/HWP 원본 직접 수정, AI의 자동 문서 저장/배포는 제외한다.

## Milestones

1. MVP Foundation
   - Next.js + TypeScript 앱 구성.
   - Prisma + Supabase Postgres 연결.
   - 기본 UI, API route, 익명 세션 구현.

2. Analysis Pipeline
   - GitHub 공개 저장소 수집.
   - 문서 parsing과 코드 chunking.
   - OpenAI/Gemini adapter와 공통 JSON report schema 구현.

3. Product UI
   - 분석 입력, provider/API key 입력, 진행 상태, 결과 요약, finding 상세, 히스토리 화면 구현.
   - reference UI 방향에 맞춰 단일 페이지 workflow 제공.

4. Verification
   - typecheck, unit test, production build 통과.
   - API 분석 생성/조회 smoke test 통과.
   - 최소 3개 공개 저장소로 실제 AI 품질 검증 예정.

5. Deployment
   - Cloud Run 배포 구성.
   - Supabase 외부 DB 연결 검증.
   - 공개 배포 전 인증 또는 rate limit 검토.

## Current Status

- 로컬 실행 가능한 베타 구현 완료.
- Supabase Postgres schema sync 완료.
- OpenAI/Gemini provider 선택, provider별 웹 API key 입력, 멀티 에이전트 분석 흐름 구현 완료.
- Windows/Linux 기준 로컬 서버 실행 및 종료 방법 문서화 완료.
- 분석 결과와 히스토리는 Supabase 저장 데이터를 다시 조회해 화면에 표시한다.
- finding 유무와 상관없이 분석 리포트 본문을 항상 표시한다.
- 화면에 표시된 분석 리포트를 PDF 저장용 리포트 화면 또는 Markdown 파일로 로컬 다운로드할 수 있다.
- 분석 기준 선택, 기준별 결과 섹션, 텍스트 PDF 통합 하이라이트 artifact, 코드 최신 모드 문서 초안 생성 기능을 구현했다.
- API key 미입력 시 heuristic fallback 동작.
- 분석 계획 에이전트와 문서 작성 에이전트도 provider를 호출하도록 구현했고, `plan -> analyze -> write_report -> report` 단계로 각 결과물이 다음 단계 입력으로 전달된다.
- 다음 단계는 실제 OpenAI/Gemini API key를 사용한 품질 검증, production artifact storage 설계 확정, Cloud Run 배포 검증이다.

## Risks

- LLM 결과 품질은 업로드 문서 품질과 수집된 코드 범위에 크게 의존한다.
- 대형 저장소는 GitHub API rate limit과 모델 입력 길이 제한으로 일부 파일만 분석될 수 있다.
- 공개 배포 시 인증 없이 API key 입력을 받으면 전송 보안과 남용 방지 정책이 필요하다.
- 하이라이트 PDF는 텍스트 레이어가 있고 evidence 문구를 좌표로 매핑할 수 있는 PDF에만 생성된다.
- local artifact storage는 개발 편의용이며 Cloud Run production 보존 저장소로 사용할 수 없다.
