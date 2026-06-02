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

  it("fills internal detection options when the request omits them", () => {
    const parsed = createAnalysisSchema.parse({
      repoUrl: "https://github.com/acme/demo",
      provider: "openai",
      comparisonBasis: "document_latest",
    });

    expect(parsed.options).toEqual({
      missingFeature: true,
      apiMismatch: true,
      outdatedDoc: true,
    });
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
    expect(normalizeOptionsForBasis("code_latest")).toEqual({
      missingFeature: false,
      apiMismatch: false,
      outdatedDoc: true,
    });
  });

  it("forces document_latest options to document-baseline checks", () => {
    expect(normalizeOptionsForBasis("document_latest")).toEqual({
      missingFeature: true,
      apiMismatch: true,
      outdatedDoc: false,
    });
  });

  it("forces unknown options to all detection types", () => {
    expect(normalizeOptionsForBasis("unknown")).toEqual({
      missingFeature: true,
      apiMismatch: true,
      outdatedDoc: true,
    });
  });
});
