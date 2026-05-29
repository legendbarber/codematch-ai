import { buildAnalysisPrompt } from "./prompt";
import { parseReport, reportJsonSchema } from "./schema";
import type {
  AnalysisReport,
  CodeChunk,
  ComparisonBasis,
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

export async function analyzeWithOpenAI(input: AnalyzeInput): Promise<AnalysisReport> {
  const apiKey = input.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      input: buildAnalysisPrompt(input),
      text: {
        format: {
          type: "json_schema",
          name: "codematch_report",
          strict: true,
          schema: reportJsonSchema,
        },
      },
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `OpenAI API 요청 실패 (${response.status})`);
  }

  const text = extractOpenAIText(payload);
  return parseReport(JSON.parse(text));
}

function extractOpenAIText(payload: unknown) {
  if (typeof payload === "object" && payload !== null && "output_text" in payload) {
    const text = (payload as { output_text?: unknown }).output_text;
    if (typeof text === "string" && text.trim()) return text;
  }

  const output = (payload as { output?: Array<{ content?: Array<{ text?: string }> }> }).output;
  const text = output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .filter(Boolean)
    .join("\n");

  if (!text) {
    throw new Error("OpenAI 응답에서 JSON 텍스트를 찾지 못했습니다.");
  }
  return text;
}
