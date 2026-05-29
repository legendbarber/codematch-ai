import { describe, expect, it } from "vitest";
import { createAnalysisSchema, normalizeOptionsForBasis } from "@/server/validation";

describe("createAnalysisSchema comparisonBasis", () => {
  it("accepts explicit comparison basis values", () => {
    const parsed = createAnalysisSchema.parse({
      repoUrl: "https://github.com/acme/demo",
      provider: "openai",
      comparisonBasis: "code_latest",
      options: {
        missingFeature: true,
        apiMismatch: true,
        outdatedDoc: true,
      },
    });

    expect(parsed.comparisonBasis).toBe("code_latest");
  });

  it("defaults comparisonBasis to unknown for legacy requests", () => {
    const parsed = createAnalysisSchema.parse({
      repoUrl: "https://github.com/acme/demo",
      provider: "gemini",
      options: {
        missingFeature: true,
        apiMismatch: true,
        outdatedDoc: true,
      },
    });

    expect(parsed.comparisonBasis).toBe("unknown");
  });

  it("rejects unknown comparison basis strings", () => {
    expect(() =>
      createAnalysisSchema.parse({
        repoUrl: "https://github.com/acme/demo",
        provider: "openai",
        comparisonBasis: "doc",
        options: {
          missingFeature: true,
          apiMismatch: true,
          outdatedDoc: true,
        },
      }),
    ).toThrow();
  });

  it("forces code_latest options to repository-only documentation gaps", () => {
    expect(
      normalizeOptionsForBasis("code_latest", {
        missingFeature: true,
        apiMismatch: true,
        outdatedDoc: false,
      }),
    ).toEqual({
      missingFeature: false,
      apiMismatch: false,
      outdatedDoc: true,
    });
  });
});
