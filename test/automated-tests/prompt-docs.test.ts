import { describe, expect, it } from "vitest";
import { loadPromptDocsForStage } from "@/server/analyzer/prompt-docs";
import {
  buildAnalysisPrompt,
  buildPlanningPrompt,
  buildReportWriterPrompt,
  selectCodeChunksForAnalysis,
} from "@/server/analyzer/prompt";
import type { AnalysisPlan, ParsedDocument, RepositorySnapshot } from "@/server/types";

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
    text: "업무 API를 제공한다.",
    chunks: [
      {
        documentName: "spec.md",
        index: 0,
        heading: "API",
        text: "업무 API를 제공한다.",
      },
    ],
  },
];

const chunks = [
  {
    path: "src/api.ts",
    language: "typescript",
    startLine: 1,
    endLine: 1,
    text: "export const handler = () => null;",
  },
];

const analysisPlan: AnalysisPlan = {
  summary: "테스트 계획",
  targetAreas: [
    {
      id: "area-1",
      priority: "high",
      documentRequirement: "업무 API 요구사항",
      candidatePaths: ["src/api.ts"],
      detectionTypes: ["missing_feature"],
      reason: "테스트",
      uncertainty: "테스트",
    },
  ],
  requiredDetectionDocs: ["detection-types/missing-feature.md"],
  analysisNotes: ["테스트"],
};

describe("loadPromptDocsForStage", () => {
  it("loads planner role and output contract documents into the planning prompt", async () => {
    const promptDocs = await loadPromptDocsForStage("planner");
    const prompt = buildPlanningPrompt({
      repository,
      documents,
      chunks,
      comparisonBasis: "document_latest",
      promptDocs,
    });

    expect(promptDocs.map((doc) => doc.relativePath)).toEqual([
      "multi-agent-docs/agents/analysis-planner-agent.md",
      "multi-agent-docs/multi-agent-workflow.md",
      "multi-agent-docs/output-contracts.md",
    ]);
    expect(prompt).toContain("Mandatory stage instruction documents:");
    expect(prompt).toContain("# 분석 계획 에이전트");
    expect(prompt).toContain("# 출력 계약");
  });

  it("loads analysis role, hallucination policy, and output contract into the analysis prompt", async () => {
    const promptDocs = await loadPromptDocsForStage("analysis");
    const prompt = buildAnalysisPrompt({
      repository,
      documents,
      chunks,
      comparisonBasis: "document_latest",
      analysisPlan,
      promptDocs,
    });

    expect(promptDocs.map((doc) => doc.relativePath)).toEqual([
      "multi-agent-docs/agents/analysis-agent.md",
      "multi-agent-docs/hallucination-mitigation.md",
      "multi-agent-docs/output-contracts.md",
    ]);
    expect(prompt).toContain("# 분석 에이전트");
    expect(prompt).toContain("# 환각 완화 정책");
    expect(prompt).toContain("# 출력 계약");
  });

  it("loads report writer role, hallucination policy, and output contract into the report prompt", async () => {
    const promptDocs = await loadPromptDocsForStage("report_writer");
    const prompt = buildReportWriterPrompt({
      repository,
      comparisonBasis: "document_latest",
      analysisPlan,
      promptDocs,
      agentReports: [
        {
          agentId: "analysis-agent-1",
          provider: "openai",
          report: { summary: "없음", findings: [] },
        },
        {
          agentId: "analysis-agent-2",
          provider: "gemini",
          report: { summary: "없음", findings: [] },
        },
        {
          agentId: "static-validation",
          provider: "static_validation",
          report: { summary: "정적 후보 없음", findings: [] },
        },
      ],
    });

    expect(promptDocs.map((doc) => doc.relativePath)).toEqual([
      "multi-agent-docs/agents/report-writer-agent.md",
      "multi-agent-docs/hallucination-mitigation.md",
      "multi-agent-docs/output-contracts.md",
      "multi-agent-docs/multi-agent-workflow.md",
    ]);
    expect(prompt).toContain("# 문서 작성 에이전트");
    expect(prompt).toContain("# 환각 완화 정책");
    expect(prompt).toContain("# 출력 계약");
    expect(prompt).toContain("static validation candidates from deterministic endpoint/function signals");
  });
});

describe("selectCodeChunksForAnalysis", () => {
  it("prioritizes analysis plan candidate paths over earlier unrelated chunks", () => {
    const selected = selectCodeChunksForAnalysis(
      [
        {
          path: "src/unrelated.ts",
          language: "typescript",
          startLine: 1,
          endLine: 1,
          text: "export const unrelated = true;",
        },
        {
          path: "src/api.ts",
          language: "typescript",
          startLine: 1,
          endLine: 1,
          text: "export function plannedApi() {}",
        },
      ],
      analysisPlan,
    );

    expect(selected.map((chunk) => chunk.path)).toEqual(["src/api.ts"]);
  });

  it("matches directory and glob candidate paths", () => {
    const selected = selectCodeChunksForAnalysis(
      [
        {
          path: "src/server/auth/service.ts",
          language: "typescript",
          startLine: 1,
          endLine: 1,
          text: "export function refreshToken() {}",
        },
        {
          path: "src/app/api/auth/route.ts",
          language: "typescript",
          startLine: 1,
          endLine: 1,
          text: "export async function POST() {}",
        },
        {
          path: "docs/spec.md",
          language: "markdown",
          startLine: 1,
          endLine: 1,
          text: "not code",
        },
      ],
      {
        ...analysisPlan,
        targetAreas: [
          {
            ...analysisPlan.targetAreas[0],
            candidatePaths: ["src/server", "src/app/api/**/route.ts"],
          },
        ],
      },
    );

    expect(selected.map((chunk) => chunk.path)).toEqual([
      "src/server/auth/service.ts",
      "src/app/api/auth/route.ts",
    ]);
  });

  it("injects selected candidate path chunks into the analysis prompt", () => {
    const prompt = buildAnalysisPrompt({
      repository,
      documents,
      chunks: [
        {
          path: "src/unrelated.ts",
          language: "typescript",
          startLine: 1,
          endLine: 1,
          text: "export const unrelated = true;",
        },
        {
          path: "src/api.ts",
          language: "typescript",
          startLine: 1,
          endLine: 1,
          text: "export function plannedApi() {}",
        },
      ],
      comparisonBasis: "document_latest",
      analysisPlan,
    });

    expect(prompt).toContain("# File: src/api.ts:1-1");
    expect(prompt).toContain("Selected code chunk policy:");
    expect(prompt).not.toContain("# File: src/unrelated.ts:1-1");
  });
});
