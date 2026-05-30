import { serializeAnalysis, serializeAnalysisSummary } from "./serializers";

export const EXAMPLE_ANALYSIS_ID = "example-northstar-retailops-wide";

const createdAt = new Date("2026-05-30T07:00:00.000Z");
const completedAt = new Date("2026-05-30T07:03:42.000Z");

const exampleAnalysis = {
  id: EXAMPLE_ANALYSIS_ID,
  repoUrl: "https://github.com/legendbarber/test-retailops",
  repoOwner: "legendbarber",
  repoName: "test-retailops",
  provider: "gemini",
  comparisonBasis: "unknown",
  optionsJson: JSON.stringify({
    missingFeature: true,
    apiMismatch: true,
    outdatedDoc: true,
  }),
  status: "completed",
  summary:
    "예시 리포트입니다. '먼저 차이 후보만 넓게 보기' 기준으로 Northstar RetailOps 기술 문서와 legendbarber/test-retailops 구현을 비교했고, 알림 읽음 처리, 반복 증빙 반려 알림, 페이지 응답 메타데이터, 문서에 없는 intervention endpoint를 추가 검토 후보로 정리했습니다.",
  totalsJson: JSON.stringify({
    total: 4,
    missingFeature: 2,
    apiMismatch: 0,
    outdatedDoc: 1,
    high: 1,
    medium: 2,
    low: 1,
    scope: {
      collectedCodeFileCount: 21,
      codeChunkCount: 72,
      documentChunkCount: 34,
      warnings: ["이 리포트는 모든 세션에 표시되는 번들 예시이며, 업로드 원본 파일은 저장하지 않았습니다."],
      githubTreeTruncated: false,
      highlightMappingFailures: 0,
    },
  }),
  error: null,
  createdAt,
  updatedAt: completedAt,
  completedAt,
  documents: [
    {
      id: "example-doc-technical-document",
      name: "technical_document.md",
      mimeType: "text/markdown",
      size: 23925,
      extractedChars: 19804,
    },
  ],
  steps: [
    {
      id: "example-step-repo",
      order: 1,
      key: "repo",
      label: "Repository URL 확인",
      status: "completed",
      message: "GitHub 공개 저장소 URL 형식 확인",
      durationMs: 39,
    },
    {
      id: "example-step-collect",
      order: 2,
      key: "collect",
      label: "GitHub 코드 수집",
      status: "completed",
      message: "TypeScript 서비스, API route, 테스트 파일 중심으로 수집",
      durationMs: 4180,
    },
    {
      id: "example-step-parse",
      order: 3,
      key: "parse",
      label: "문서 Parsing",
      status: "completed",
      message: "Northstar RetailOps 기술 문서 Markdown 파싱",
      durationMs: 91,
    },
    {
      id: "example-step-plan",
      order: 4,
      key: "plan",
      label: "분석 계획 수립",
      status: "completed",
      message: "권한, 업무 상태, 증빙, 알림, 감사 로그 영역을 우선 분석 대상으로 선정",
      durationMs: 18520,
    },
    {
      id: "example-step-analyze",
      order: 5,
      key: "analyze",
      label: "분석 중",
      status: "completed",
      message: "두 분석 에이전트가 코드 근거와 문서 요구사항을 병렬 비교",
      durationMs: 74100,
    },
    {
      id: "example-step-write-report",
      order: 6,
      key: "write_report",
      label: "분석 리포트 생성",
      status: "completed",
      message: "합의 항목과 추가 검토 후보를 구분해 최종 리포트 작성",
      durationMs: 29600,
    },
    {
      id: "example-step-report",
      order: 7,
      key: "report",
      label: "결과 저장 및 아티팩트 생성",
      status: "completed",
      message: "모든 세션에서 볼 수 있는 번들 예시로 저장",
      durationMs: 120,
    },
  ],
  findings: [
    {
      id: "example-finding-notification-read",
      type: "missing_feature",
      severity: "medium",
      title: "알림 읽음 처리 API와 readAt 갱신 흐름 누락 후보",
      documentEvidence:
        "기술 문서 4.4는 사용자가 알림을 읽음 처리할 수 있어야 하며, 읽음 처리 시각을 readAt으로 저장해야 한다고 정의합니다.",
      codeEvidence:
        "Notification 타입에는 readAt 필드가 있지만 src/api/server.ts에는 GET /notifications만 있고, src/services/notification-service.ts에는 알림 생성/deduplication 로직만 존재합니다. readAt을 설정하는 service 함수나 PATCH/POST endpoint가 확인되지 않습니다.",
      relatedFilesJson: JSON.stringify([
        "src/domain/types.ts",
        "src/services/notification-service.ts",
        "src/api/server.ts",
      ]),
      documentLocationJson: JSON.stringify({
        documentName: "technical_document.md",
        matchedText: "사용자는 알림을 읽음 처리할 수 있으며, 읽음 처리 시각은 readAt으로 저장한다.",
        highlightStatus: "not_applicable",
      }),
      codeLocationsJson: JSON.stringify([
        {
          path: "src/domain/types.ts",
          symbolName: "Notification",
          startLine: 149,
          endLine: 158,
        },
        {
          path: "src/services/notification-service.ts",
          symbolName: "generateOperationalNotifications",
          startLine: 33,
          endLine: 70,
        },
        {
          path: "src/api/server.ts",
          startLine: 130,
          endLine: 132,
          endpoint: {
            method: "GET",
            path: "/notifications",
          },
        },
      ]),
      recommendation:
        "멀티 에이전트 합의: analysis-agent-1, analysis-agent-2. PATCH /notifications/:notificationId/read 같은 endpoint와 markNotificationRead service를 추가하고, 대상 사용자 권한 확인 후 readAt을 저장하도록 구현하세요.",
      confidence: 0.85,
    },
    {
      id: "example-finding-rejection-manager-alert",
      type: "missing_feature",
      severity: "high",
      title: "2회 이상 증빙 반려 시 권역 매니저 별도 알림 누락 후보",
      documentEvidence:
        "기술 문서 4.3은 동일 업무에서 반려가 2회 이상 발생하면 riskScore에 가산점을 적용하고 권역 매니저에게 별도 알림을 생성해야 한다고 정의합니다.",
      codeEvidence:
        "reviewEvidence는 반려 시 rejectionCount를 증가시키고 refreshTaskScores로 riskScore 가산을 반영합니다. 그러나 generateOperationalNotifications의 EVIDENCE_REJECTED 알림은 STORE_MANAGER와 STORE_STAFF에게만 생성되며, rejectionCount >= 2 조건으로 REGION_MANAGER에게 별도 알림을 만드는 로직은 확인되지 않습니다.",
      relatedFilesJson: JSON.stringify([
        "src/services/evidence-service.ts",
        "src/services/notification-service.ts",
        "src/services/priority.ts",
        "src/domain/types.ts",
      ]),
      documentLocationJson: JSON.stringify({
        documentName: "technical_document.md",
        matchedText: "동일 업무에서 반려가 2회 이상 발생하면 riskScore에 가산점을 적용하고 권역 매니저에게 별도 알림을 생성한다.",
        highlightStatus: "not_applicable",
      }),
      codeLocationsJson: JSON.stringify([
        {
          path: "src/services/evidence-service.ts",
          symbolName: "reviewEvidence",
          startLine: 103,
          endLine: 135,
        },
        {
          path: "src/services/notification-service.ts",
          symbolName: "generateOperationalNotifications",
          startLine: 50,
          endLine: 65,
        },
        {
          path: "src/services/priority.ts",
          symbolName: "calculateRiskScore",
          startLine: 34,
          endLine: 40,
        },
      ]),
      recommendation:
        "멀티 에이전트 합의: analysis-agent-1, analysis-agent-2. rejectionCount가 2 이상인 반려 업무에 대해 권역 매니저 대상 알림을 별도로 생성하거나, 기존 HIGH_RISK_TASK와 다른 dedupeKey/메시지로 반복 반려 맥락을 명확히 표시하세요.",
      confidence: 0.78,
    },
    {
      id: "example-finding-task-list-pagination",
      type: "missing_feature",
      severity: "medium",
      title: "업무 목록 페이지 응답 메타데이터 누락 후보",
      documentEvidence:
        "기술 문서 4.1은 업무 목록 응답을 페이지 단위로 제공하고, 대량 업무가 존재해도 과도한 데이터를 반환하지 않아야 한다고 정의합니다.",
      codeEvidence:
        "listTasksForUser는 page와 pageSize로 slice를 수행하지만 API는 배열만 반환합니다. totalCount, page, pageSize, hasNext 같은 페이지 메타데이터가 없어 클라이언트가 전체 페이지 상태를 판단하기 어렵습니다.",
      relatedFilesJson: JSON.stringify([
        "src/services/task-service.ts",
        "src/api/server.ts",
      ]),
      documentLocationJson: JSON.stringify({
        documentName: "technical_document.md",
        matchedText: "목록 응답은 페이지 단위로 제공하며, 대량 업무가 존재해도 한 번에 과도한 데이터를 반환하지 않아야 한다.",
        highlightStatus: "not_applicable",
      }),
      codeLocationsJson: JSON.stringify([
        {
          path: "src/services/task-service.ts",
          symbolName: "listTasksForUser",
          startLine: 34,
          endLine: 57,
        },
        {
          path: "src/api/server.ts",
          startLine: 77,
          endLine: 80,
          endpoint: {
            method: "GET",
            path: "/tasks",
          },
        },
      ]),
      recommendation:
        "분석 에이전트-정적 검증 일치: analysis-agent-1, static-validation. GET /tasks 응답을 { items, page, pageSize, totalCount, hasNext } 형태로 확장하면 문서의 페이지 단위 제공 기준을 더 명확히 충족합니다.",
      confidence: 0.72,
    },
    {
      id: "example-finding-intervention-plan-doc",
      type: "outdated_doc",
      severity: "low",
      title: "intervention-plan endpoint가 기술 문서의 API/기능 목록에 명시되지 않음",
      documentEvidence:
        "기술 문서는 위험 업무 알림과 향후 원인 분석 방향은 설명하지만, 업무별 개입 계획을 반환하는 구체 endpoint나 응답 구조는 1차 기능 요구사항에 명시하지 않습니다.",
      codeEvidence:
        "src/api/server.ts는 GET /tasks/:taskId/intervention-plan endpoint를 제공하고, src/services/intervention-service.ts는 riskReasons, recommendedActions, confidence, reviewNotes를 포함한 개입 계획을 생성합니다.",
      relatedFilesJson: JSON.stringify([
        "src/api/server.ts",
        "src/services/intervention-service.ts",
        "src/domain/types.ts",
      ]),
      documentLocationJson: JSON.stringify({
        documentName: "technical_document.md",
        matchedText: "향후 반복 반려 업무의 원인 분석 기능을 추가할 수 있다.",
        highlightStatus: "not_applicable",
      }),
      codeLocationsJson: JSON.stringify([
        {
          path: "src/api/server.ts",
          startLine: 93,
          endLine: 95,
          endpoint: {
            method: "GET",
            path: "/tasks/:taskId/intervention-plan",
          },
        },
        {
          path: "src/services/intervention-service.ts",
          symbolName: "generateTaskInterventionPlan",
          startLine: 23,
          endLine: 99,
        },
      ]),
      recommendation:
        "추가 검토 필요: 이 endpoint가 제품 범위에 포함된 구현 기능이라면 기술 문서에 endpoint 목적, 권한, 응답 필드, confidence 의미를 추가하세요. 실험 기능이면 README 또는 내부 문서에만 남기는 편이 좋습니다.",
      confidence: 0.59,
    },
  ],
  artifacts: [],
  documentationDrafts: [],
};

export function getExampleAnalysisSummary() {
  return {
    ...serializeAnalysisSummary(exampleAnalysis),
    isExample: true,
  };
}

export function getExampleAnalysis(id: string) {
  if (id !== EXAMPLE_ANALYSIS_ID) return null;
  return {
    ...serializeAnalysis(exampleAnalysis),
    isExample: true,
  };
}
