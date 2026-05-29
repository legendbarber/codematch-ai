import { buildAnalysisPrompt } from "./prompt";
import { parseDocumentationDraft, parseReport } from "./schema";
import type {
  AnalysisReport,
  CodeChunk,
  CodeLocation,
  ComparisonBasis,
  DocumentationDraft,
  ParsedDocument,
  RepositorySnapshot,
} from "../types";

type AnalyzeInput = {
  repository: RepositorySnapshot;
  documents: ParsedDocument[];
  chunks: CodeChunk[];
  comparisonBasis: ComparisonBasis;
  apiKey?: string;
};

export async function analyzeWithGemini(input: AnalyzeInput): Promise<AnalysisReport> {
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
            parts: [{ text: buildAnalysisPrompt(input) }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: geminiResponseSchema,
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

  return parseReport(JSON.parse(text));
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
You are CodeMatch AI. Write a Korean documentation addition draft based only on the provided code evidence.
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
            enum: ["high", "medium", "low"],
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
