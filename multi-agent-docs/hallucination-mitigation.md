# 환각 완화 정책

CodeMatchAA의 환각 완화 목표는 LLM이 문서나 코드에 없는 내용을 만들어 finding으로 보고하는 일을 줄이는 것이다. 핵심 전략은 독립 분석 2회, 근거 기반 confidence, 문서 작성 단계의 합의 검증이다.

## 병렬 분석

- 분석 에이전트 2개는 같은 입력을 받되 서로의 결과를 보지 않는다.
- 같은 provider만 사용할 수 있어도 두 분석은 독립 호출로 수행한다.
- OpenAI와 Gemini를 모두 사용할 수 있으면 서로 다른 provider 결과를 비교한다.
- provider별 표현 차이를 줄이기 위해 동일한 출력 계약과 동일한 탐지 유형 문서를 사용한다.

## 근거 필수 원칙

finding은 다음 중 최소 하나의 구체 위치를 포함해야 한다.

- 문서: documentName, pageNumber, matchedText, heading.
- 코드: path, symbolName, startLine, endLine, endpoint method/path.

문서 근거와 코드 근거가 모두 추상적인 경우 최종 finding으로 확정하지 않는다.

## confidence 제한

- 두 분석 에이전트가 같은 finding에 동의하면 기존 confidence를 유지하거나 소폭 상향할 수 있다.
- 한쪽만 제기한 finding은 `needs_review`로 분류하고 confidence를 최대 `0.65`로 제한한다.
- 코드 또는 문서 중 한쪽 근거가 없으면 confidence를 최대 `0.60`으로 제한한다.
- 수집 범위 경고가 있는 영역의 finding은 confidence를 최대 `0.70`으로 제한한다.
- 추론 중심 finding은 최종 리포트에서 확정 표현을 쓰지 않는다.

## disagreement 처리

분석 에이전트 결과가 충돌하면 문서 작성 에이전트는 다음 정보를 남긴다.

- 충돌한 finding type.
- 각 분석 에이전트의 주장 요약.
- 서로 다른 근거 위치.
- 추가 확인이 필요한 파일 또는 문서 section.
- 최종 리포트 포함 여부.

충돌한 항목은 기본적으로 확정 finding이 아니라 `분석 결과 불일치` 영역에 둔다.

## 부재 표현 정책

코드 구현을 찾지 못한 경우 다음 표현을 사용한다.

```text
수집·분석된 코드 범위에서 구현 근거를 확인하지 못했습니다.
```

다음 표현은 피한다.

- 구현되어 있지 않습니다.
- 절대 존재하지 않습니다.
- 코드에 없습니다.

## 문서 작성 에이전트 검증 규칙

- 두 결과에 없는 finding을 새로 만들지 않는다.
- 근거 위치가 없는 finding은 제외하거나 검토 메모로 낮춘다.
- 같은 endpoint나 파일 위치를 가리키는 중복 finding은 병합한다.
- `comparisonBasis`와 맞지 않는 finding type은 최종 결과에서 제외한다.
- 사용자에게 필요한 조치는 기준본에 맞춰 작성하되, `unknown`에서는 수정 대상을 단정하지 않는다.
