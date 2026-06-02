import { loadRequiredDetectionDocs } from "./detection-docs";
import { buildAnalysisPrompt, buildPlanningPrompt, buildReportWriterPrompt } from "./prompt";
import { loadPromptDocsForStage } from "./prompt-docs";
import { parseAnalysisPlan, parseDocumentationDraft, parseReport } from "./schema";
import type {
  AnalysisOptions,
  AnalysisPlan,
  AnalysisReport,
  CodeChunk,
  CodeLocation,
  ComparisonBasis,
  DocumentationDraft,
  ParsedDocument,
  Provider,
  RepositorySnapshot,
} from "../types";

type AnalyzeInput = {
  repository: RepositorySnapshot;
  documents: ParsedDocument[];
  chunks: CodeChunk[];
  comparisonBasis: ComparisonBasis;
  options?: AnalysisOptions;
  apiKey?: string;
  analysisPlan?: AnalysisPlan;
  agentId?: string;
  provider?: Provider;
};

type PlanInput = {
  repository: RepositorySnapshot;
  documents: ParsedDocument[];
  chunks: CodeChunk[];
  comparisonBasis: ComparisonBasis;
  apiKey?: string;
};

type ReportWriterInput = {
  repository: RepositorySnapshot;
  comparisonBasis: ComparisonBasis;
  analysisPlan: AnalysisPlan;
  agentReports: Array<{
    agentId: string;
    provider: string;
    report: AnalysisReport;
  }>;
  apiKey?: string;
};

export async function planWithGemini(input: PlanInput): Promise<AnalysisPlan> {
  const promptDocs = await loadPromptDocsForStage("planner");
  const text = await requestGeminiJson({
    apiKey: input.apiKey,
    prompt: buildPlanningPrompt({ ...input, promptDocs }),
    responseSchema: geminiPlanResponseSchema,
  });
  return parseAnalysisPlan(JSON.parse(text));
}

export async function analyzeWithGemini(input: AnalyzeInput): Promise<AnalysisReport> {
  const [promptDocs, detectionDocs] = await Promise.all([
    loadPromptDocsForStage("analysis"),
    loadRequiredDetectionDocs(input),
  ]);
  const text = await requestGeminiJson({
    apiKey: input.apiKey,
    prompt: buildAnalysisPrompt({ ...input, promptDocs, detectionDocs }),
    responseSchema: geminiResponseSchema,
  });
  return parseReport(JSON.parse(text));
}

export async function writeReportWithGemini(input: ReportWriterInput): Promise<AnalysisReport> {
  const promptDocs = await loadPromptDocsForStage("report_writer");
  const text = await requestGeminiJson({
    apiKey: input.apiKey,
    prompt: buildReportWriterPrompt({ ...input, promptDocs }),
    responseSchema: geminiResponseSchema,
  });
  return parseReport(JSON.parse(text));
}

type GeminiJsonInput = {
  apiKey?: string;
  prompt: string;
  responseSchema: unknown;
};

async function requestGeminiJson(input: GeminiJsonInput) {
  const apiKey = input.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY가 설정되어 있지 않습니다.");
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: input.prompt }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: input.responseSchema,
        },
      }),
      signal: AbortSignal.timeout(90_000),
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Gemini API 요청 실패 (${response.status})`);
  }

  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text)
    .filter(Boolean)
    .join("\n");

  if (!text) {
    throw new Error("Gemini 응답에서 JSON 텍스트를 찾지 못했습니다.");
  }

  return text;
}

type DraftInput = {
  apiKey?: string;
  findingTitle: string;
  codeEvidence: string;
  documentEvidence: string;
  recommendation: string;
  codeLocations: CodeLocation[];
};

export async function generateDocumentationDraftWithGemini(input: DraftInput): Promise<DocumentationDraft> {
  const apiKey = input.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY가 설정되어 있지 않습니다.");
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: buildDraftPrompt(input),
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: geminiDraftResponseSchema,
        },
      }),
      signal: AbortSignal.timeout(90_000),
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Gemini API 요청 실패 (${response.status})`);
  }

  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text)
    .filter(Boolean)
    .join("\n");

  if (!text) {
    throw new Error("Gemini 응답에서 문서 초안 JSON을 찾지 못했습니다.");
  }

  return parseDocumentationDraft(JSON.parse(text));
}

function buildDraftPrompt(input: DraftInput) {
  return `
You are CodeMatchAA. Write a Korean documentation addition draft based only on the provided code evidence.
Return JSON only.

Finding title:
${input.findingTitle}

Code locations:
${input.codeLocations.map((location) => JSON.stringify(location)).join("\n") || "No structured code locations"}

Code evidence:
${input.codeEvidence}

Existing document evidence:
${input.documentEvidence}

Recommendation:
${input.recommendation}

Rules:
- Do not claim unverified thresholds, security guarantees, or external behavior.
- Mention review notes for values or public wording that need human confirmation.
- The body must be directly copyable into a technical document.
`.trim();
}

const geminiResponseSchema = {
  type: "OBJECT",
  required: ["summary", "findings"],
  properties: {
    summary: { type: "STRING" },
    findings: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: [
          "type",
          "severity",
          "title",
          "documentEvidence",
          "codeEvidence",
          "relatedFiles",
          "recommendation",
          "confidence",
        ],
        properties: {
          type: {
            type: "STRING",
            enum: ["missing_feature", "api_mismatch", "outdated_doc"],
          },
          severity: {
            type: "STRING",
            enum: ["high", "low"],
          },
          title: { type: "STRING" },
          documentEvidence: { type: "STRING" },
          codeEvidence: { type: "STRING" },
          relatedFiles: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
          documentLocation: {
            type: "OBJECT",
            properties: {
              documentName: { type: "STRING" },
              pageNumber: { type: "NUMBER" },
              matchedText: { type: "STRING" },
              boundingBoxes: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    x: { type: "NUMBER" },
                    y: { type: "NUMBER" },
                    width: { type: "NUMBER" },
                    height: { type: "NUMBER" },
                  },
                },
              },
            },
          },
          codeLocations: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                path: { type: "STRING" },
                symbolName: { type: "STRING" },
                startLine: { type: "NUMBER" },
                endLine: { type: "NUMBER" },
                endpoint: {
                  type: "OBJECT",
                  properties: {
                    method: { type: "STRING" },
                    path: { type: "STRING" },
                  },
                },
              },
            },
          },
          recommendation: { type: "STRING" },
          confidence: { type: "NUMBER" },
        },
      },
    },
  },
} as const;

const geminiPlanResponseSchema = {
  type: "OBJECT",
  required: ["summary", "targetAreas", "requiredDetectionDocs", "analysisNotes"],
  properties: {
    summary: { type: "STRING" },
    targetAreas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: [
          "id",
          "priority",
          "documentRequirement",
          "candidatePaths",
          "detectionTypes",
          "reason",
          "uncertainty",
        ],
        properties: {
          id: { type: "STRING" },
          priority: { type: "STRING", enum: ["high", "low"] },
          documentRequirement: { type: "STRING" },
          candidatePaths: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
          detectionTypes: {
            type: "ARRAY",
            items: {
              type: "STRING",
              enum: ["missing_feature", "api_mismatch", "outdated_doc"],
            },
          },
          reason: { type: "STRING" },
          uncertainty: { type: "STRING" },
        },
      },
    },
    requiredDetectionDocs: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    analysisNotes: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
  },
} as const;

const geminiDraftResponseSchema = {
  type: "OBJECT",
  required: ["suggestedSection", "suggestedTitle", "body", "supportingCodeLocations"],
  properties: {
    suggestedSection: { type: "STRING" },
    suggestedTitle: { type: "STRING" },
    body: { type: "STRING" },
    supportingCodeLocations: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          path: { type: "STRING" },
          symbolName: { type: "STRING" },
          startLine: { type: "NUMBER" },
          endLine: { type: "NUMBER" },
          endpoint: {
            type: "OBJECT",
            properties: {
              method: { type: "STRING" },
              path: { type: "STRING" },
            },
          },
        },
      },
    },
    reviewNotes: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
  },
} as const;
