import { heuristicAnalyze } from "./heuristic";
import { analyzeWithGemini } from "./gemini";
import { analyzeWithOpenAI } from "./openai";
import { filterReportByOptions, parseReport } from "./schema";
import type {
  AnalysisOptions,
  AnalysisReport,
  CodeChunk,
  ComparisonBasis,
  ParsedDocument,
  Provider,
  RepositorySnapshot,
} from "../types";

type AnalyzeInput = {
  provider: Provider;
  comparisonBasis: ComparisonBasis;
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
    return augmentWithHeuristicFindings(
      filterReportByOptions(parseReport(report), input.options, input.comparisonBasis),
      input,
    );
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

function augmentWithHeuristicFindings(report: AnalysisReport, input: AnalyzeInput): AnalysisReport {
  if (input.comparisonBasis === "unknown") {
    return report;
  }

  const heuristicReport = heuristicAnalyze({
    ...input,
    reason: "정적 endpoint/function 신호로 기준본별 결과를 보강했습니다.",
  });
  if (!heuristicReport.findings.length) return report;

  const findings = [...report.findings];
  const seen = new Set(findings.map((finding) => findingKey(finding)));
  for (const finding of heuristicReport.findings) {
    const key = findingKey(finding);
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push(finding);
  }

  return {
    summary:
      findings.length === report.findings.length
        ? report.summary
        : `${report.summary} 정적 코드/문서 신호로 ${findings.length - report.findings.length}건을 추가 확인했습니다.`,
    findings: findings.slice(0, 12),
  };
}

function findingKey(finding: AnalysisReport["findings"][number]) {
  const codeLocation = finding.codeLocations?.[0];
  const documentLocation = finding.documentLocation;
  return [
    finding.type,
    finding.title.toLowerCase(),
    codeLocation?.path ?? "",
    codeLocation?.endpoint ? `${codeLocation.endpoint.method}:${codeLocation.endpoint.path}` : "",
    documentLocation?.documentName ?? "",
    documentLocation?.pageNumber ?? "",
  ].join(":");
}

function hasProviderKey(provider: Provider, requestApiKey?: string) {
  if (requestApiKey) return true;
  return provider === "openai" ? Boolean(process.env.OPENAI_API_KEY) : Boolean(process.env.GEMINI_API_KEY);
}

function providerLabel(provider: Provider) {
  return provider === "openai" ? "OpenAI" : "Gemini";
}
