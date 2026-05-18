import { heuristicAnalyze } from "./heuristic";
import { analyzeWithGemini } from "./gemini";
import { analyzeWithOpenAI } from "./openai";
import { filterReportByOptions, parseReport } from "./schema";
import type {
  AnalysisOptions,
  AnalysisReport,
  CodeChunk,
  ParsedDocument,
  Provider,
  RepositorySnapshot,
} from "../types";

type AnalyzeInput = {
  provider: Provider;
  options: AnalysisOptions;
  repository: RepositorySnapshot;
  documents: ParsedDocument[];
  chunks: CodeChunk[];
  apiKey?: string;
};

export async function analyzeRepository(input: AnalyzeInput): Promise<AnalysisReport> {
  const allowFallback = process.env.ALLOW_HEURISTIC_FALLBACK !== "false";

  try {
    const report =
      input.provider === "openai"
        ? await analyzeWithOpenAI(input)
        : await analyzeWithGemini(input);
    return filterReportByOptions(parseReport(report), input.options);
  } catch (error) {
    if (!allowFallback || hasProviderKey(input.provider, input.apiKey)) {
      throw error;
    }

    return heuristicAnalyze({
      ...input,
      reason: `${providerLabel(input.provider)} API key가 없어 로컬 휴리스틱 분석을 사용했습니다.`,
    });
  }
}

function hasProviderKey(provider: Provider, requestApiKey?: string) {
  if (requestApiKey) return true;
  return provider === "openai" ? Boolean(process.env.OPENAI_API_KEY) : Boolean(process.env.GEMINI_API_KEY);
}

function providerLabel(provider: Provider) {
  return provider === "openai" ? "OpenAI" : "Gemini";
}
