import { loadRequiredDetectionDocs } from "./detection-docs";
import { buildAnalysisPrompt, buildPlanningPrompt, buildReportWriterPrompt } from "./prompt";
import { loadPromptDocsForStage } from "./prompt-docs";
import { analysisPlanJsonSchema, parseAnalysisPlan, parseReport, reportJsonSchema } from "./schema";
import type {
  AnalysisOptions,
  AnalysisPlan,
  AnalysisReport,
  CodeChunk,
  ComparisonBasis,
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

export async function planWithOpenAI(input: PlanInput): Promise<AnalysisPlan> {
  const promptDocs = await loadPromptDocsForStage("planner");
  const payload = await requestOpenAIJson({
    apiKey: input.apiKey,
    schemaName: "codematch_analysis_plan",
    schema: analysisPlanJsonSchema,
    prompt: buildPlanningPrompt({ ...input, promptDocs }),
  });
  return parseAnalysisPlan(JSON.parse(payload));
}

export async function analyzeWithOpenAI(input: AnalyzeInput): Promise<AnalysisReport> {
  const [promptDocs, detectionDocs] = await Promise.all([
    loadPromptDocsForStage("analysis"),
    loadRequiredDetectionDocs(input),
  ]);
  const payload = await requestOpenAIJson({
    apiKey: input.apiKey,
    schemaName: "codematch_report",
    schema: reportJsonSchema,
    prompt: buildAnalysisPrompt({ ...input, promptDocs, detectionDocs }),
  });
  return parseReport(JSON.parse(payload));
}

export async function writeReportWithOpenAI(input: ReportWriterInput): Promise<AnalysisReport> {
  const promptDocs = await loadPromptDocsForStage("report_writer");
  const payload = await requestOpenAIJson({
    apiKey: input.apiKey,
    schemaName: "codematch_final_report",
    schema: reportJsonSchema,
    prompt: buildReportWriterPrompt({ ...input, promptDocs }),
  });
  return parseReport(JSON.parse(payload));
}

type OpenAIJsonInput = {
  apiKey?: string;
  schemaName: string;
  schema: unknown;
  prompt: string;
};

async function requestOpenAIJson(input: OpenAIJsonInput) {
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
      input: input.prompt,
      text: {
        format: {
          type: "json_schema",
          name: input.schemaName,
          strict: true,
          schema: input.schema,
        },
      },
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `OpenAI API 요청 실패 (${response.status})`);
  }

  return extractOpenAIText(payload);
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
