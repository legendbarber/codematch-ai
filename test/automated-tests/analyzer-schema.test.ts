import { describe, expect, it } from "vitest";
import { filterReportByOptions } from "@/server/analyzer/schema";

describe("filterReportByOptions", () => {
  it("keeps only repository-only documentation gaps in code_latest mode", () => {
    const filtered = filterReportByOptions(
      {
        summary: "mixed",
        findings: [
          {
            type: "api_mismatch",
            severity: "high",
            title: "API differs",
            documentEvidence: "문서 API",
            codeEvidence: "코드 API",
            relatedFiles: ["src/api.ts"],
            recommendation: "확인",
            confidence: 0.5,
          },
          {
            type: "outdated_doc",
            severity: "high",
            title: "GET /tasks/:id/intervention-plan 문서 반영 필요",
            documentEvidence: "문서에 없음",
            codeEvidence: "코드에 있음",
            relatedFiles: ["src/api.ts"],
            codeLocations: [
              {
                path: "src/api.ts",
                endpoint: { method: "GET", path: "/tasks/:id/intervention-plan" },
              },
            ],
            recommendation: "문서에 추가",
            confidence: 0.7,
          },
        ],
      },
      {
        missingFeature: true,
        apiMismatch: true,
        outdatedDoc: true,
      },
      "code_latest",
    );

    expect(filtered.findings).toHaveLength(1);
    expect(filtered.findings[0].type).toBe("outdated_doc");
  });
});
