# 프롬프트 조립 정책

멀티 에이전트 프롬프트는 모든 문서를 한 번에 넣지 않는다. Claude Code의 skill처럼 현재 단계와 탐지 유형에 필요한 문서만 읽어 컨텍스트를 절약한다.

## 공통 입력

모든 에이전트 프롬프트에는 다음 값을 포함한다.

- `comparisonBasis`: `document_latest`, `code_latest`, `unknown`.
- 선택된 탐지 옵션.
- 현재 단계의 출력 계약.
- 분석 범위와 수집 경고.
- 한국어 출력 요구.

## 분석 계획 에이전트

로드할 문서:

- `agents/analysis-planner-agent.md`
- `multi-agent-workflow.md`의 1단계 내용.
- `output-contracts.md`의 분석 계획 출력 계약.

입력 데이터:

- 문서 요약과 heading.
- 레포지토리 디렉터리 구조.
- 파일 path 목록.
- endpoint 후보 목록이 있으면 함께 제공한다.

로드하지 않을 문서:

- 전체 코드 청크.
- 세부 탐지 유형 문서 전체. 계획 단계에서는 탐지 유형 이름만 선택한다.

## 분석 에이전트

로드할 문서:

- `agents/analysis-agent.md`
- `hallucination-mitigation.md`
- `output-contracts.md`의 분석 에이전트 출력 계약.
- 분석 계획이 지정한 탐지 유형 문서.

탐지 유형 문서 선택:

- `missing_feature`가 필요하면 `detection-types/missing-feature.md`만 추가한다.
- `api_mismatch`가 필요하면 `detection-types/api-mismatch.md`만 추가한다.
- `outdated_doc`가 필요하면 `detection-types/outdated-doc.md`만 추가한다.

입력 데이터:

- 분석 계획.
- 관련 문서 청크.
- 관련 코드 청크.
- endpoint/function/class 신호.

## 문서 작성 에이전트

로드할 문서:

- `agents/report-writer-agent.md`
- `hallucination-mitigation.md`
- `output-contracts.md`의 최종 리포트 출력 계약.
- `multi-agent-workflow.md`의 3단계 내용.

입력 데이터:

- 분석 계획.
- 분석 에이전트 A 결과.
- 분석 에이전트 B 결과.
- 분석 범위와 경고.

로드하지 않을 문서:

- 원본 코드 전체.
- 원본 문서 전체.

문서 작성 에이전트는 새 분석을 수행하지 않고 두 분석 결과의 근거 품질과 합의 여부만 검토한다.

## 기준본별 탐지 문서 기본값

`document_latest`:

- `missing-feature.md`
- `api-mismatch.md`

`code_latest`:

- `outdated-doc.md`

`unknown`:

- 사용자가 선택한 옵션에 따라 세 문서 중 필요한 문서만 로드한다.

## 프롬프트 조립 순서

1. 에이전트 역할 문서를 시스템 지침으로 넣는다.
2. 필요한 환각 완화 정책을 넣는다.
3. 현재 단계 출력 계약을 넣는다.
4. 필요한 탐지 유형 문서를 넣는다.
5. 실제 분석 입력 데이터를 넣는다.
6. JSON 또는 Markdown 출력 형식을 명시한다.
