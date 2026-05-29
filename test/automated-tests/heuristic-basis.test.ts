import { describe, expect, it } from "vitest";
import { heuristicAnalyze } from "@/server/analyzer/heuristic";
import { chunkDocument } from "@/server/document-parser";
import { chunkSourceFiles } from "@/server/chunker";
import type { ParsedDocument, RepositorySnapshot } from "@/server/types";

const options = {
  missingFeature: true,
  apiMismatch: true,
  outdatedDoc: true,
};

function document(name: string, text: string): ParsedDocument {
  return {
    name,
    mimeType: "text/markdown",
    size: Buffer.byteLength(text),
    text,
    chunks: chunkDocument(name, text).map((chunk) => ({ ...chunk, pageNumber: 2 })),
  };
}

function repository(files: RepositorySnapshot["files"]): RepositorySnapshot {
  return {
    owner: "demo",
    repo: "retailops",
    defaultBranch: "main",
    description: null,
    htmlUrl: "https://github.com/demo/retailops",
    files,
    warnings: [],
  };
}

describe("heuristicAnalyze comparison basis behavior", () => {
  it("flags document-baseline requirements that are not found in code", () => {
    const docs = [
      document(
        "technical_document.md",
        [
          "### 4.5 AI 기반 고위험 업무 개입 플랜",
          "시스템은 GET /tasks/:taskId/intervention-plan API와 generateTaskInterventionPlan() 함수를 제공해야 한다.",
          "응답에는 interventionPlan 필드가 포함되어야 한다.",
        ].join("\n"),
      ),
    ];
    const repo = repository([
      {
        path: "src/api/server.ts",
        language: "TypeScript",
        text: "router.get('/tasks/:taskId', getTask);",
      },
    ]);

    const report = heuristicAnalyze({
      repository: repo,
      documents: docs,
      chunks: chunkSourceFiles(repo.files),
      options,
      comparisonBasis: "document_latest",
    });

    expect(report.findings.some((finding) => finding.type === "missing_feature")).toBe(true);
    expect(report.findings.map((finding) => finding.documentLocation?.matchedText).join("\n")).toContain(
      "intervention-plan",
    );
  });

  it("flags code-baseline endpoints and functions that are not found in the document", () => {
    const docs = [
      document(
        "technical_document.md",
        "### 4.4 감사 이력\n업무 변경 이력과 감사 로그를 제공한다.",
      ),
    ];
    const repo = repository([
      {
        path: "src/api/server.ts",
        language: "TypeScript",
        text: "router.get('/tasks/:taskId/intervention-plan', getInterventionPlan);",
      },
      {
        path: "src/services/intervention-service.ts",
        language: "TypeScript",
        text: "export function generateTaskInterventionPlan() {\n  return { recommendedActions: [] };\n}",
      },
    ]);

    const report = heuristicAnalyze({
      repository: repo,
      documents: docs,
      chunks: chunkSourceFiles(repo.files),
      options,
      comparisonBasis: "code_latest",
    });

    expect(report.findings.some((finding) => finding.type === "outdated_doc")).toBe(true);
    expect(report.findings.map((finding) => finding.codeLocations?.[0]?.path).join("\n")).toContain(
      "src/api/server.ts",
    );
    expect(report.findings.map((finding) => finding.codeEvidence).join("\n")).toContain("intervention-plan");
  });
});
