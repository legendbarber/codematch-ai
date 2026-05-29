import { describe, expect, it } from "vitest";
import { parseDocumentationDraft } from "@/server/analyzer/schema";

describe("parseDocumentationDraft", () => {
  it("validates Gemini documentation draft structured output", () => {
    const draft = parseDocumentationDraft({
      suggestedSection: "3.2 안전 주행 제어",
      suggestedTitle: "위험 구간 자동 감속 기능",
      body: "시스템은 위험 구간 진입이 감지되면 목표 속도를 제한한다.",
      supportingCodeLocations: [
        {
          path: "src/app/api/example/route.ts",
          startLine: 1,
          endLine: 12,
          endpoint: { method: "POST", path: "/api/example" },
        },
      ],
      reviewNotes: ["실제 임계값은 코드 기준으로 확인 필요"],
    });

    expect(draft.supportingCodeLocations[0].endpoint?.method).toBe("POST");
  });

  it("rejects empty drafts", () => {
    expect(() => parseDocumentationDraft({ body: "" })).toThrow();
  });
});
