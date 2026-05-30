import { describe, expect, it } from "vitest";
import { loadRequiredDetectionDocs } from "@/server/analyzer/detection-docs";
import { buildAnalysisPrompt } from "@/server/analyzer/prompt";
import type { AnalysisPlan, ParsedDocument, RepositorySnapshot } from "@/server/types";

const analysisPlan: AnalysisPlan = {
  summary: "테스트 계획",
  targetAreas: [
    {
      id: "area-1",
      priority: "high",
      documentRequirement: "업무 API 요구사항",
      candidatePaths: ["src/api.ts"],
      detectionTypes: ["missing_feature", "api_mismatch", "outdated_doc"],
      reason: "테스트",
      uncertainty: "테스트",
    },
  ],
  requiredDetectionDocs: [
    "detection-types/missing-feature.md",
    "detection-types/api-mismatch.md",
    "detection-types/outdated-doc.md",
  ],
  analysisNotes: ["테스트"],
};

const repository: RepositorySnapshot = {
  owner: "acme",
  repo: "demo",
  defaultBranch: "main",
  description: null,
  htmlUrl: "https://github.com/acme/demo",
  warnings: [],
  files: [
    {
      path: "src/api.ts",
      language: "typescript",
      text: "export const handler = () => null;",
    },
  ],
};

const documents: ParsedDocument[] = [
  {
    name: "spec.md",
    mimeType: "text/markdown",
    size: 100,
    text: "GET /tasks API를 제공한다.",
    chunks: [
      {
        documentName: "spec.md",
        index: 0,
        heading: "API",
        text: "GET /tasks API를 제공한다.",
      },
    ],
  },
];

describe("loadRequiredDetectionDocs", () => {
  it("loads only document-latest detection documents selected by options", async () => {
    const docs = await loadRequiredDetectionDocs({
      analysisPlan,
      comparisonBasis: "document_latest",
      options: {
        missingFeature: true,
        apiMismatch: false,
        outdatedDoc: true,
      },
    });

    expect(docs.map((doc) => doc.type)).toEqual(["missing_feature"]);
    expect(docs[0].relativePath).toBe("multi-agent-docs/detection-types/missing-feature.md");
    expect(docs[0].content).toContain("# missing_feature 탐지 기준");
  });

  it("loads the code-latest detection document and injects it into the analysis prompt", async () => {
    const docs = await loadRequiredDetectionDocs({
      analysisPlan,
      comparisonBasis: "code_latest",
      options: {
        missingFeature: true,
        apiMismatch: true,
        outdatedDoc: true,
      },
    });

    const prompt = buildAnalysisPrompt({
      repository,
      documents,
      chunks: [
        {
          path: "src/api.ts",
          language: "typescript",
          startLine: 1,
          endLine: 1,
          text: "export const handler = () => null;",
        },
      ],
      comparisonBasis: "code_latest",
      analysisPlan,
      detectionDocs: docs,
    });

    expect(docs.map((doc) => doc.type)).toEqual(["outdated_doc"]);
    expect(prompt).toContain("Mandatory detection standard documents:");
    expect(prompt).toContain("Source: multi-agent-docs/detection-types/outdated-doc.md");
    expect(prompt).toContain("# outdated_doc 탐지 기준");
    expect(prompt).not.toContain("# missing_feature 탐지 기준");
  });
});
