import { buildAnalysisPrompt } from "./prompt";
import { parseReport } from "./schema";
import type { AnalysisReport, CodeChunk, ParsedDocument, RepositorySnapshot } from "../types";

type AnalyzeInput = {
  repository: RepositorySnapshot;
  documents: ParsedDocument[];
  chunks: CodeChunk[];
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
          recommendation: { type: "STRING" },
          confidence: { type: "NUMBER" },
        },
      },
    },
  },
} as const;
