# api_mismatch 탐지 기준

## 정의

`api_mismatch`는 기술문서에 정의된 API와 코드 구현의 path, method, request, response, status code, field, validation, 인증 조건이 서로 다르게 확인되는 경우를 의미한다.

## 적용 조건

- `comparisonBasis`가 `document_latest` 또는 `unknown`일 때 사용한다.
- 문서와 코드 양쪽에서 API 관련 근거가 확인되어야 한다.
- 단순한 명칭 차이가 아니라 클라이언트 연동이나 계약에 영향을 줄 수 있는 차이를 우선한다.

## 분석 절차

1. 문서에서 API path, method, request body, query, response, status code, field를 추출한다.
2. 코드에서 route handler, controller, schema, validator, serializer, OpenAPI 정의, 테스트를 확인한다.
3. 문서와 구현의 계약 차이를 필드 단위로 비교한다.
4. 차이가 사용자 또는 연동 시스템에 미치는 영향을 판단한다.
5. 문서와 코드 중 어느 쪽이 최신인지 단정하지 말고 `comparisonBasis`에 맞춰 표현한다.

## 필요한 근거

- 문서 근거: API 계약이 명시된 section, table, 예시 payload, matchedText.
- 코드 근거: route path/method, validator/schema, handler, serializer, 테스트 위치.
- 위치 정보: endpoint method/path와 관련 path, symbolName, line range.

## 제외 조건

- 문서에는 API가 없고 코드에만 API가 있는 경우는 `outdated_doc` 후보로 본다.
- 문서에 기능만 있고 API 계약이 명확하지 않은 경우는 `missing_feature` 또는 검토 메모로 분류한다.
- 코드에서 동등한 호환 alias 또는 backward compatibility를 제공하는 경우.
- `code_latest` 모드인 경우 최종 finding으로 보고하지 않는다.

## Severity 기준

`high`:

- path 또는 method가 달라 호출이 실패하는 경우.
- 필수 request/response field가 달라 클라이언트 연동이 깨지는 경우.
- 인증/권한 조건, 상태 코드, 에러 처리 차이가 보안 또는 핵심 흐름에 영향을 주는 경우.

`medium`:

- 일부 field 이름, optional/required 여부, pagination/filtering 방식 차이처럼 부분 연동 오류 가능성이 있는 경우.
- 문서 예시와 실제 schema가 다르지만 핵심 호출은 가능한 경우.

`low`:

- 설명 문구, 예시 값, ordering, 부가 field처럼 영향이 제한적인 경우.
- 구현은 호환되지만 문서가 덜 정확해 혼란을 줄 수 있는 경우.
