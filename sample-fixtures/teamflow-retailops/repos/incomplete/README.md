# TeamFlow RetailOps Incomplete Fixture

This repository is intentionally incomplete for CodeMatch mismatch testing.
It keeps the basic campaign/task/evidence flow, but omits several features
required by the technical specification.

Known gaps:

- No task comment API or comment service
- No assignee change API
- No task due-date change API
- No user role change API
- No secure evidence download-link API
- Task list filtering is limited to status only
- Store staff can cancel tasks, which violates the documented permission model

Northstar RetailOps AI 업무 조율 플랫폼의 테스트용 구현 저장소입니다.

## 핵심 기능

- 본사 캠페인 생성과 매장별 업무 카드 자동 생성
- 역할, 권역, 매장 기준 접근 제어
- 업무 상태 전이와 증빙 검수 흐름
- 업무 댓글 및 현장 메모 감사 로그
- `executionPriority`, `riskScore` 결정적 계산
- 증빙 파일 metadata 검증, 시간 제한 다운로드 링크, 감사 로그 기록
- 마감 임박, 지연, 반려, 검수 대기, 고위험 업무 알림 생성

## 실행

```bash
npm install
npm run dev
```

```bash
npm test
npm run build
```

## API

- `GET /health`
- `POST /campaigns`
- `POST /campaigns/:campaignId/archive`
- `GET /tasks`
- `POST /tasks/:taskId/transition`
- `PATCH /tasks/:taskId/due-at`
- `PATCH /tasks/:taskId/assignee`
- `GET /tasks/:taskId/comments`
- `POST /tasks/:taskId/comments`
- `DELETE /tasks/:taskId/comments/:commentId`
- `POST /tasks/:taskId/evidence`
- `POST /evidence/:evidenceId/review`
- `GET /evidence/:evidenceId/download-link`
- `GET /evidence/:evidenceId/download`
- `GET /notifications`
- `PATCH /users/:userId/role`

## 구현 메모

이 저장소는 CodeMatch AI 검증용 샘플입니다. 문서의 주요 개념이 코드에서 추적되도록 작성했지만, 실제 제품 수준의 인증, 파일 저장소, 이미지 검수, 외부 ERP 연동은 포함하지 않습니다.
