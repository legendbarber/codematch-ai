# CodeMatchAA 예시 리포트: Northstar RetailOps

- Repository: `legendbarber/test-retailops`
- 기술 문서: `technical_document.md`
- 분석 기준: 먼저 차이 후보만 넓게 보기
- 앱 내 예시 ID: `example-northstar-retailops-wide`

## 요약

이 리포트는 웹을 처음 연 사용자에게 CodeMatchAA 결과 형식을 보여주기 위한 영구 예시다. 실제 `GEMINI_API_KEY` 기반 분석을 시도한 뒤, 코드 근거를 재검토해 명확한 후보만 번들 예시 데이터로 정리했다.

## 포함된 후보

1. 알림 읽음 처리 API와 `readAt` 갱신 흐름 누락 후보
2. 2회 이상 증빙 반려 시 권역 매니저 별도 알림 누락 후보
3. 업무 목록 페이지 응답 메타데이터 누락 후보
4. `GET /tasks/:taskId/intervention-plan` endpoint가 기술 문서의 API/기능 목록에 명시되지 않은 후보

## 저장 방식

세션별 Supabase 히스토리는 사용자마다 달라지므로, 이 예시 리포트는 `src/server/example-analysis.ts`에 번들된 정적 분석 레코드로 제공한다. `/api/analyses` 응답의 첫 항목으로 항상 포함되며, `/api/analyses/example-northstar-retailops-wide`에서 세션 쿠키 없이 상세 조회할 수 있다.
