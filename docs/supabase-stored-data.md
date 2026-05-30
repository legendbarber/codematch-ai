# Supabase Stored Data

CodeMatch AI는 Supabase를 PostgreSQL 데이터베이스로 사용한다. 애플리케이션 코드는 Supabase SDK가 아니라 Prisma Client를 통해 Supabase Postgres에 접근한다.

스키마의 원본은 `prisma/schema.prisma`이며, 현재 저장 테이블은 다음 4개다.

- `Analysis`: 분석 요청 1건의 메인 레코드
- `UploadedDocument`: 업로드 문서의 메타데이터
- `AnalysisStep`: 분석 진행 단계별 상태 로그
- `Finding`: AI 또는 휴리스틱 분석 결과로 생성된 정합성 의심 항목

## 저장 흐름 요약

1. 사용자가 저장소 URL, provider, 분석 옵션, 개발 문서를 제출한다.
2. `POST /api/analyses`가 익명 세션 쿠키를 확인하거나 새로 만들고 `Analysis` 레코드를 생성한다.
3. 같은 요청에서 고정된 분석 단계 목록을 `AnalysisStep`에 미리 생성한다.
4. 백그라운드 분석 runner가 GitHub 저장소를 수집하고 업로드 문서를 파싱한다.
5. 파싱이 끝나면 업로드 문서의 원본이 아니라 파일명, MIME 타입, 크기, 추출 글자 수만 `UploadedDocument`에 저장한다.
6. 분석 중 각 단계의 상태, 실패 메시지, 소요 시간을 `AnalysisStep`에 업데이트한다.
7. `write_report` 단계에서 문서 작성 에이전트가 최종 리포트를 생성한다.
8. `report` 단계에서 finding 목록과 요약, 집계값, artifact metadata를 저장하고 `Analysis.status`를 `completed`로 바꾼다.
9. 실패하면 `Analysis.status`를 `failed`로 바꾸고 `Analysis.error`에 오류 메시지를 저장한다.

## `Analysis`

분석 요청의 루트 테이블이다. 화면의 히스토리 목록과 단일 분석 상세 조회의 기준이 된다.

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `String` | 분석 ID. Prisma `cuid()`로 생성된다. |
| `sessionId` | `String` | 익명 브라우저 세션 ID. 로그인 없이 사용자별 히스토리를 구분한다. |
| `repoUrl` | `String` | 사용자가 입력한 GitHub 저장소 URL. |
| `repoOwner` | `String?` | GitHub owner 또는 organization 이름. URL 파싱 또는 저장소 수집 후 저장된다. |
| `repoName` | `String?` | GitHub repository 이름. |
| `provider` | `String` | 분석 provider. 현재 값은 `openai` 또는 `gemini`다. |
| `optionsJson` | `String` | 사용자가 선택한 분석 옵션 JSON 문자열. |
| `status` | `String` | 분석 상태. 기본값은 `queued`다. |
| `summary` | `String?` | 최종 분석 요약 문장. 분석 성공 후 저장된다. |
| `totalsJson` | `String?` | finding 집계 JSON 문자열. 분석 성공 후 저장된다. |
| `error` | `String?` | 실패 시 오류 메시지. |
| `createdAt` | `DateTime` | 분석 생성 시각. |
| `updatedAt` | `DateTime` | 분석 레코드 갱신 시각. Prisma `@updatedAt`로 자동 갱신된다. |
| `completedAt` | `DateTime?` | 완료 또는 실패 시각. |

### `optionsJson`

분석 옵션은 문자열 컬럼에 JSON으로 저장된다.

```json
{
  "missingFeature": true,
  "apiMismatch": true,
  "outdatedDoc": true
}
```

- `missingFeature`: 문서에는 있으나 코드에서 확인되지 않는 기능 탐지
- `apiMismatch`: API 경로, 메서드, 요청/응답 형태 불일치 탐지
- `outdatedDoc`: 코드 변화가 문서에 반영되지 않은 가능성 탐지

### `status`

현재 코드에서 사용하는 상태값은 다음과 같다.

- `queued`: 요청 생성 직후, 분석 대기
- `collecting`: 저장소 URL 확인 및 GitHub 코드 수집 중
- `parsing`: 업로드 문서 파싱 중
- `analyzing`: AI 또는 휴리스틱 비교 분석 중
- `reporting`: finding과 요약 저장 중
- `completed`: 분석 성공
- `failed`: 분석 실패

### `totalsJson`

최종 finding 개수를 유형과 심각도별로 집계한 JSON 문자열이다.

```json
{
  "total": 3,
  "missingFeature": 1,
  "apiMismatch": 1,
  "outdatedDoc": 1,
  "high": 1,
  "medium": 2,
  "low": 0
}
```

### 인덱스

- `sessionId`, `createdAt`: 세션별 최근 분석 히스토리 조회용
- `status`: 상태 기반 조회용

## `UploadedDocument`

업로드된 개발 문서의 메타데이터만 저장한다. 원본 파일 바이너리와 전체 파싱 텍스트는 저장하지 않는다.

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `String` | 문서 메타데이터 ID. Prisma `cuid()`로 생성된다. |
| `analysisId` | `String` | 소속 분석 ID. `Analysis.id`를 참조한다. |
| `name` | `String` | 업로드 파일명. |
| `mimeType` | `String` | 브라우저가 전달한 MIME 타입. |
| `size` | `Int` | 파일 크기, byte 단위. |
| `extractedChars` | `Int` | 파싱 후 추출된 텍스트 길이. |
| `createdAt` | `DateTime` | 메타데이터 저장 시각. |

`UploadedDocument.analysisId`는 `Analysis.id`에 연결되며, 분석이 삭제되면 관련 문서 메타데이터도 cascade 삭제된다.

## `AnalysisStep`

분석 진행 상황을 단계별로 저장한다. 새 분석이 생성되면 아래 7개 단계가 먼저 만들어지고, runner가 실행되면서 상태와 소요 시간이 갱신된다.

| order | key | label |
| --- | --- | --- |
| 1 | `repo` | `Repository URL 확인` |
| 2 | `collect` | `GitHub 코드 수집` |
| 3 | `parse` | `문서 Parsing` |
| 4 | `plan` | `멀티 에이전트 분석 계획 수립` |
| 5 | `analyze` | `분석 에이전트 2개 병렬 비교` |
| 6 | `write_report` | `문서 작성 에이전트 최종 리포트 생성` |
| 7 | `report` | `결과 저장 및 아티팩트 생성` |

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `String` | 단계 ID. Prisma `cuid()`로 생성된다. |
| `analysisId` | `String` | 소속 분석 ID. `Analysis.id`를 참조한다. |
| `order` | `Int` | 화면 표시 순서. |
| `key` | `String` | 단계 식별자. 한 분석 안에서 유일하다. |
| `label` | `String` | 화면에 표시할 단계명. |
| `status` | `String` | 단계 상태. 기본값은 `pending`이다. |
| `message` | `String?` | 단계 실패 시 오류 메시지. 성공 시 보통 `null`이다. |
| `durationMs` | `Int?` | 단계 실행 소요 시간, millisecond 단위. |
| `createdAt` | `DateTime` | 단계 레코드 생성 시각. |
| `updatedAt` | `DateTime` | 단계 레코드 갱신 시각. |

단계 상태값은 `pending`, `running`, `completed`, `failed`를 사용한다.

### 제약과 인덱스

- `analysisId`, `key` 조합은 unique다.
- `analysisId`, `order` 인덱스는 분석 상세 화면의 단계 정렬 조회에 사용된다.
- 분석이 삭제되면 관련 단계도 cascade 삭제된다.

## `Finding`

분석 결과로 생성된 문서-코드 불일치 후보를 저장한다. 각 finding은 UI 리포트 카드, Markdown 다운로드, PDF 출력의 원본 데이터가 된다.

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `String` | finding ID. Prisma `cuid()`로 생성된다. |
| `analysisId` | `String` | 소속 분석 ID. `Analysis.id`를 참조한다. |
| `type` | `String` | finding 유형. |
| `severity` | `String` | 심각도. |
| `title` | `String` | finding 제목. |
| `documentEvidence` | `String` | 문서 쪽 근거 스니펫. 최대 1200자 schema 제한이 있다. |
| `codeEvidence` | `String` | 코드 쪽 근거 스니펫. 최대 1200자 schema 제한이 있다. |
| `relatedFilesJson` | `String` | 관련 파일 경로 배열을 JSON 문자열로 저장한다. |
| `recommendation` | `String` | 권장 조치. 최대 1000자 schema 제한이 있다. |
| `confidence` | `Float` | 분석 신뢰도. 0부터 1 사이 값이다. |
| `createdAt` | `DateTime` | finding 저장 시각. |

### `type`

현재 저장 가능한 finding 유형은 다음 3개다.

- `missing_feature`: 문서에 있는 기능이 코드에서 확인되지 않음
- `api_mismatch`: 문서의 API 명세와 실제 코드 구현이 다름
- `outdated_doc`: 문서가 최신 코드 상태를 반영하지 못했을 가능성

### `severity`

현재 심각도 값은 다음 3개다.

- `high`
- `medium`
- `low`

### `relatedFilesJson`

관련 파일 경로 배열을 JSON 문자열로 저장한다.

```json
[
  "src/app/api/analyses/route.ts",
  "src/server/analysis-runner.ts"
]
```

API 응답에서는 `serializeAnalysis`가 이 문자열을 파싱해 `relatedFiles` 배열로 내려준다.

### 인덱스

- `analysisId`, `severity`: 분석별 심각도 조회와 정렬 보조
- `analysisId`, `type`: 분석별 finding 유형 조회 보조

분석이 삭제되면 관련 finding도 cascade 삭제된다.

## 저장하지 않는 데이터

다음 데이터는 Supabase에 저장하지 않는다.

- 업로드 원본 파일 바이너리
- 업로드 문서의 전체 파싱 텍스트
- GitHub 저장소에서 수집한 전체 소스 코드
- GitHub 파일 chunk 본문
- 화면에서 입력한 OpenAI 또는 Gemini API key
- AI provider 요청/응답 원문 전체

API key는 `POST /api/analyses` 요청에서 `openaiApiKey`, `geminiApiKey`로 전달되고, 해당 분석 실행 중 provider 호출에만 사용된다. DB에는 API key 컬럼이 없고, 문서에도 기록하지 않는 정책이다.

## 세션과 히스토리

로그인은 없으며 브라우저 쿠키 `codematch_session`으로 익명 세션을 구분한다.

- 쿠키 값은 `sessionId`로 `Analysis`에 저장된다.
- `GET /api/analyses`는 현재 세션의 최근 분석 20개를 조회한다.
- `GET /api/analyses/:id`는 현재 세션의 분석만 상세 조회한다.
- 따라서 같은 Supabase DB를 쓰더라도 세션이 다르면 기본 UI에서 서로의 히스토리를 볼 수 없다.

쿠키 옵션은 `httpOnly`, `sameSite=lax`, `path=/`, `maxAge=30일`이며 production에서는 `secure`가 켜진다.

## API 응답에서의 변환

DB에는 JSON 성격의 값 일부가 문자열로 저장되지만, API 응답에서는 serializer가 파싱해서 내려준다.

| DB 컬럼 | API 응답 필드 |
| --- | --- |
| `Analysis.optionsJson` | `analysis.options` |
| `Analysis.totalsJson` | `analysis.totals` |
| `Finding.relatedFilesJson` | `finding.relatedFiles` |

또한 API는 finding 목록을 바탕으로 `reportRecommendationSummary`를 계산해 응답에 포함한다. 이 값은 DB 컬럼으로 저장되는 값이 아니라 응답 생성 시 계산되는 값이다.

## Supabase SQL 확인 예시

최근 분석:

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

분석 1건의 저장 데이터:

```sql
select *
from "Analysis"
where "id" = '<analysis-id>';

select *
from "UploadedDocument"
where "analysisId" = '<analysis-id>'
order by "createdAt" asc;

select *
from "AnalysisStep"
where "analysisId" = '<analysis-id>'
order by "order" asc;

select *
from "Finding"
where "analysisId" = '<analysis-id>'
order by "createdAt" asc;
```

API key 저장 컬럼이 없는지 확인:

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('Analysis', 'UploadedDocument', 'AnalysisStep', 'Finding')
  and column_name ilike '%key%'
  and not (table_name = 'AnalysisStep' and column_name = 'key');
```

예상 결과는 행이 0개라는 것이다. `AnalysisStep.key`는 진행 단계 식별자이며 provider API key와 무관하므로 확인 쿼리에서 제외했다.
