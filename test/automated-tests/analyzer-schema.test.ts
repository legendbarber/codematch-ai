import { describe, expect, it } from "vitest";
import { filterReportByOptions, parseReport } from "@/server/analyzer/schema";

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
    expect(filtered.findings[0].severity).toBe("high");
  });

  it("rejects medium severity from new provider reports", () => {
    expect(() =>
      parseReport({
        summary: "unsupported severity",
        findings: [
          {
            type: "api_mismatch",
            severity: "medium",
            title: "API differs",
            documentEvidence: "문서 API",
            codeEvidence: "코드 API",
            relatedFiles: [],
            recommendation: "확인",
            confidence: 0.5,
          },
        ],
      }),
    ).toThrow();
  });

  it("uses the comparison basis preset instead of client detection options", () => {
    const filtered = filterReportByOptions(
      {
        summary: "document latest",
        findings: [
          {
            type: "missing_feature",
            severity: "low",
            title: "Missing workflow",
            documentEvidence: "문서 요구사항",
            codeEvidence: "코드 근거 미확인",
            relatedFiles: [],
            recommendation: "확인",
            confidence: 0.5,
          },
          {
            type: "api_mismatch",
            severity: "high",
            title: "API differs",
            documentEvidence: "문서 API",
            codeEvidence: "코드 API",
            relatedFiles: [],
            recommendation: "확인",
            confidence: 0.5,
          },
          {
            type: "outdated_doc",
            severity: "low",
            title: "Missing documentation",
            documentEvidence: "문서에 없음",
            codeEvidence: "코드에 있음",
            relatedFiles: [],
            recommendation: "확인",
            confidence: 0.5,
          },
        ],
      },
      {
        missingFeature: false,
        apiMismatch: false,
        outdatedDoc: true,
      },
      "document_latest",
    );

    expect(filtered.findings.map((finding) => finding.type)).toEqual(["missing_feature", "api_mismatch"]);
  });
});
