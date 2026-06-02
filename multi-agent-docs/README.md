# Multi-Agent Docs

이 디렉터리는 CodeMatchAA를 단일 분석 에이전트 구조에서 3단계 멀티 에이전트 구조로 확장하기 위한 한글 설계 문서 모음이다. 현재 앱 코드는 단일 `AI analyzer`를 중심으로 동작하지만, 이 문서들은 이후 구현자가 에이전트 역할, 프롬프트, 출력 계약, 탐지 기준을 바로 코드에 반영할 수 있도록 기준을 고정한다.

## 문서 목록

- `multi-agent-workflow.md`: 전체 분석 흐름과 단계별 입출력.
- `agents/analysis-planner-agent.md`: 분석 계획 에이전트 페르소나, 책임, 프롬프트.
- `agents/analysis-agent.md`: 실제 비교 분석 에이전트 페르소나, 책임, 프롬프트.
- `agents/report-writer-agent.md`: 두 분석 결과를 병합하는 문서 작성 에이전트 페르소나, 책임, 프롬프트.
- `detection-types/missing-feature.md`: `missing_feature` 탐지 기준.
- `detection-types/api-mismatch.md`: `api_mismatch` 탐지 기준.
- `detection-types/outdated-doc.md`: `outdated_doc` 탐지 기준.
- `hallucination-mitigation.md`: 환각 완화 정책과 합의/불일치 처리.
- `output-contracts.md`: 계획, 분석, 최종 리포트의 출력 계약.
- `prompt-assembly.md`: 단계별 프롬프트 조립 방식과 탐지 유형 문서 로딩 정책.

## 전체 흐름

1. 분석 계획 에이전트가 기술문서 요약과 레포지토리 디렉터리 구조만 보고 분석 계획을 만든다.
2. 분석 에이전트 2개가 같은 계획을 기준으로 병렬 분석한다.
3. 문서 작성 에이전트가 두 분석 결과를 비교해 최종 리포트를 작성한다.

사용자가 OpenAI 또는 Gemini 중 하나의 API key만 제공하면 같은 provider를 쓰는 분석 에이전트 2개를 실행한다. OpenAI와 Gemini API key를 모두 제공하면 OpenAI 분석 에이전트 1개와 Gemini 분석 에이전트 1개를 실행한다.

## 적용 원칙

- 탐지 유형 이름은 현재 코드와 호환되도록 `missing_feature`, `api_mismatch`, `outdated_doc`만 사용한다.
- 심각도는 현재 코드와 호환되도록 `high`, `low`만 사용한다.
- 기준본은 현재 앱의 `document_latest`, `code_latest`, `unknown` 의미를 유지한다.
- 모든 finding은 문서 근거와 코드 근거 중 최소 하나 이상의 구체 위치를 포함해야 한다.
- 근거가 부족한 추론은 최종 리포트에서 확정 표현이 아니라 추가 검토 대상으로 표시한다.
