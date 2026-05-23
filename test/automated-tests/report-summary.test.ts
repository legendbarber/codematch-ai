import { describe, expect, it } from "vitest";
import { createReportRecommendationSummary } from "@/server/report-summary";

describe("createReportRecommendationSummary", () => {
  it("returns default review actions when there are no findings", () => {
    const summary = createReportRecommendationSummary([]);

    expect(summary.headline).toContain("중요 불일치");
    expect(summary.priorityActions).toHaveLength(3);
    expect(summary.reviewFocus).toContain("주요 API 경로");
  });

  it("prioritizes high confidence severe findings", () => {
    const summary = createReportRecommendationSummary([
      {
        type: "outdated_doc",
        severity: "low",
        title: "문서 설명 부족",
        documentEvidence: "문서 근거",
        codeEvidence: "코드 근거",
        recommendation: "문서에 API 설명을 추가하세요.",
        confidence: 0.9,
      },
      {
        type: "api_mismatch",
        severity: "high",
        title: "API 경로 불일치",
        documentEvidence: "문서 근거",
        codeEvidence: "코드 근거",
        recommendation: "문서의 API 경로와 구현 route를 맞추세요.",
        confidence: 0.7,
      },
    ]);

    expect(summary.headline).toContain("2개의 정합성 의심 항목");
    expect(summary.priorityActions[0]).toContain("API 불일치");
    expect(summary.priorityActions[0]).toContain("높은 우선순위");
  });
});
