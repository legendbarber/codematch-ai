import { heuristicAnalyze } from "./heuristic";
import { analyzeWithGemini, planWithGemini, writeReportWithGemini } from "./gemini";
import { analyzeWithOpenAI, planWithOpenAI, writeReportWithOpenAI } from "./openai";
import { filterReportByOptions, parseReport } from "./schema";
import { summarizeCodeSignals } from "../chunker";
import type {
  AnalysisPlan,
  AnalysisOptions,
  AnalysisReport,
  CodeChunk,
  ComparisonBasis,
  FindingType,
  ParsedDocument,
  Provider,
  ProviderCredentials,
  ReportFinding,
  RepositorySnapshot,
} from "../types";

export type AnalyzeInput = {
  provider: Provider;
  comparisonBasis: ComparisonBasis;
  options: AnalysisOptions;
  repository: RepositorySnapshot;
  documents: ParsedDocument[];
  chunks: CodeChunk[];
  credentials?: ProviderCredentials;
  analysisPlan?: AnalysisPlan;
};

export async function analyzeRepository(input: AnalyzeInput): Promise<AnalysisReport> {
  const analysisPlan = input.analysisPlan ?? (await createAnalysisPlan(input));
  const agentReports = await runAnalysisAgents({ ...input, analysisPlan });
  return writeAnalysisReport({ ...input, analysisPlan, agentReports });
}

export async function runAnalysisAgents(input: AnalyzeInput & { analysisPlan: AnalysisPlan }): Promise<AnalysisAgentResult[]> {
  const agentConfigs = selectAnalysisAgents(input);
  return Promise.all(
    agentConfigs.map((config, index) =>
      runAnalysisAgent({
        ...input,
        provider: config.provider,
        apiKey: providerRequestKey(config.provider, input.credentials),
        agentId: `analysis-agent-${index + 1}`,
        analysisPlan: input.analysisPlan,
      }),
    ),
  );
}

export async function writeAnalysisReport(input: ReportWriterInput): Promise<AnalysisReport> {
  const staticValidationReport = createStaticValidationReport(input);
  const agentReports = staticValidationReport
    ? [...input.agentReports, staticValidationReport]
    : input.agentReports;
  const mergedReport = await writeFinalReport({
    ...input,
    agentReports,
  });
  return mergedReport;
}

export async function createAnalysisPlan(input: Omit<AnalyzeInput, "analysisPlan">): Promise<AnalysisPlan> {
  const plannerProvider = selectSingleAgentProvider(input);
  try {
    return plannerProvider === "openai"
      ? await planWithOpenAI({
          ...input,
          apiKey: providerRequestKey("openai", input.credentials),
        })
      : await planWithGemini({
          ...input,
          apiKey: providerRequestKey("gemini", input.credentials),
        });
  } catch (error) {
    if (process.env.ALLOW_HEURISTIC_FALLBACK === "false" || providerHasKey(plannerProvider, input.credentials)) {
      throw error;
    }

    return createFallbackAnalysisPlan(input, `${providerLabel(plannerProvider)} 계획 에이전트 API key가 없어 구조 기반 fallback 계획을 사용했습니다.`);
  }
}

function createFallbackAnalysisPlan(input: Omit<AnalyzeInput, "analysisPlan">, reason?: string): AnalysisPlan {
  const codeSignals = summarizeCodeSignals(input.chunks);
  const documentChunks = input.documents.flatMap((document) => document.chunks);
  const detectionTypes = detectionTypesFor(input.comparisonBasis, input.options);
  const candidateFiles = codeSignals.files.length
    ? codeSignals.files
    : input.repository.files.map((file) => file.path).slice(0, 120);
  const targetAreas = documentChunks
    .slice(0, 8)
    .map((chunk, index) => {
      const requirement = compactText(chunk.heading || chunk.text, 180);
      const candidatePaths = rankCandidatePaths(requirement, candidateFiles).slice(0, 8);
      return {
        id: `area-${index + 1}`,
        priority: index < 3 ? "high" : index < 6 ? "medium" : "low",
        documentRequirement: requirement || `${chunk.documentName} chunk ${chunk.index + 1}`,
        candidatePaths,
        detectionTypes,
        reason:
          candidatePaths.length > 0
            ? "문서 요구사항의 도메인 용어와 파일 경로/endpoint 신호가 일부 연결됩니다."
            : "문서 요구사항과 직접 연결되는 파일명을 구조 정보만으로 확정하기 어렵습니다.",
        uncertainty: "계획 단계는 코드 본문을 확정 판단하지 않고 후속 분석 범위를 좁히는 용도입니다.",
      } satisfies AnalysisPlan["targetAreas"][number];
    });

  if (!targetAreas.length) {
    targetAreas.push({
      id: "area-1",
      priority: "medium",
      documentRequirement: "업로드 문서 전체 요구사항",
      candidatePaths: candidateFiles.slice(0, 12),
      detectionTypes,
      reason: "문서 chunk가 비어 있어 수집된 파일 경로와 endpoint 신호를 넓게 확인합니다.",
      uncertainty: "문서 구조가 부족해 분석 범위가 넓습니다.",
    });
  }

  return {
    summary: `${input.repository.owner}/${input.repository.repo}의 디렉터리 구조와 업로드 문서 기준으로 ${targetAreas.length}개 우선 분석 영역을 선정했습니다.`,
    targetAreas,
    requiredDetectionDocs: detectionTypes.map((type) => {
      if (type === "missing_feature") return "detection-types/missing-feature.md";
      if (type === "api_mismatch") return "detection-types/api-mismatch.md";
      return "detection-types/outdated-doc.md";
    }),
    analysisNotes: [
      reason ?? "계획 에이전트는 코드 본문이 아니라 디렉터리 구조와 문서 요약만 사용합니다.",
      codeSignals.endpoints.length
        ? `감지된 endpoint 후보: ${codeSignals.endpoints.slice(0, 8).join(", ")}`
        : "감지된 endpoint 후보가 없으므로 파일 경로와 문서 용어 중심으로 분석합니다.",
    ],
  };
}

type AnalysisAgentConfig = {
  provider: Provider;
};

type RunAnalysisAgentInput = AnalyzeInput & {
  provider: Provider;
  apiKey?: string;
  agentId: string;
  analysisPlan: AnalysisPlan;
};

export type AnalysisAgentResult = {
  agentId: string;
  provider: Provider | "heuristic" | "static_validation";
  report: AnalysisReport;
};

export type ReportWriterInput = AnalyzeInput & {
  analysisPlan: AnalysisPlan;
  agentReports: AnalysisAgentResult[];
};

async function runAnalysisAgent(input: RunAnalysisAgentInput): Promise<AnalysisAgentResult> {
  const allowFallback = process.env.ALLOW_HEURISTIC_FALLBACK !== "false";

  try {
    const report =
      input.provider === "openai"
        ? await analyzeWithOpenAI(input)
        : await analyzeWithGemini(input);
    return {
      agentId: input.agentId,
      provider: input.provider,
      report: filterReportByOptions(parseReport(report), input.options, input.comparisonBasis),
    };
  } catch (error) {
    if (!allowFallback || providerHasKey(input.provider, input.credentials)) {
      throw error;
    }

    return {
      agentId: input.agentId,
      provider: "heuristic",
      report: heuristicAnalyze({
        ...input,
        reason: `${providerLabel(input.provider)} API key가 없어 ${input.agentId}에서 로컬 휴리스틱 분석을 사용했습니다.`,
      }),
    };
  }
}

function selectAnalysisAgents(input: AnalyzeInput): AnalysisAgentConfig[] {
  const openaiReady = providerHasKey("openai", input.credentials);
  const geminiReady = providerHasKey("gemini", input.credentials);
  if (openaiReady && geminiReady) {
    return [{ provider: "openai" }, { provider: "gemini" }];
  }

  if (providerHasKey(input.provider, input.credentials)) {
    return [{ provider: input.provider }, { provider: input.provider }];
  }

  const alternate = input.provider === "openai" ? "gemini" : "openai";
  if (providerHasKey(alternate, input.credentials)) {
    return [{ provider: alternate }, { provider: alternate }];
  }

  return [{ provider: input.provider }, { provider: input.provider }];
}

function selectSingleAgentProvider(input: AnalyzeInput): Provider {
  if (providerHasKey(input.provider, input.credentials)) {
    return input.provider;
  }

  const alternate = input.provider === "openai" ? "gemini" : "openai";
  if (providerHasKey(alternate, input.credentials)) {
    return alternate;
  }

  return input.provider;
}

async function writeFinalReport(input: ReportWriterInput): Promise<AnalysisReport> {
  const writerProvider = selectSingleAgentProvider(input);
  try {
    const report =
      writerProvider === "openai"
        ? await writeReportWithOpenAI({
            repository: input.repository,
            comparisonBasis: input.comparisonBasis,
            analysisPlan: input.analysisPlan,
            agentReports: input.agentReports,
            apiKey: providerRequestKey("openai", input.credentials),
          })
        : await writeReportWithGemini({
            repository: input.repository,
            comparisonBasis: input.comparisonBasis,
            analysisPlan: input.analysisPlan,
            agentReports: input.agentReports,
            apiKey: providerRequestKey("gemini", input.credentials),
          });
    return normalizeReportWriterOutput(
      filterReportByOptions(parseReport(report), input.options, input.comparisonBasis),
      input,
    );
  } catch (error) {
    if (process.env.ALLOW_HEURISTIC_FALLBACK === "false" || providerHasKey(writerProvider, input.credentials)) {
      throw error;
    }

    return mergeAgentReports(input.agentReports, input);
  }
}

function mergeAgentReports(agentReports: AnalysisAgentResult[], input: AnalyzeInput): AnalysisReport {
  const groups = new Map<string, Array<{ finding: ReportFinding; agent: AnalysisAgentResult }>>();
  for (const agentReport of agentReports) {
    for (const finding of agentReport.report.findings) {
      const key = mergeFindingKey(finding);
      groups.set(key, [...(groups.get(key) ?? []), { finding, agent: agentReport }]);
    }
  }

  const findings = [...groups.values()]
    .map((items) => {
      const best = [...items].sort((a, b) => b.finding.confidence - a.finding.confidence)[0];
      const supportingAgents = unique(items.map((item) => item.agent.agentId));
      const providers = unique(items.map((item) => item.agent.provider));
      const modelAgentCount = items.filter((item) => item.agent.provider !== "static_validation").length;
      const staticValidationCount = items.filter((item) => item.agent.provider === "static_validation").length;
      const isModelConsensus = modelAgentCount >= 2;
      const isCrossSourceAgreement = modelAgentCount >= 1 && staticValidationCount >= 1;
      const adjustedConfidence = isModelConsensus
        ? Math.min(0.95, Math.max(...items.map((item) => item.finding.confidence)) + 0.05)
        : isCrossSourceAgreement
          ? Math.min(0.8, Math.max(...items.map((item) => item.finding.confidence)) + 0.03)
          : Math.min(staticValidationCount > 0 && modelAgentCount === 0 ? 0.6 : 0.65, best.finding.confidence);
      const mergeLabel = isModelConsensus
        ? `멀티 에이전트 합의: ${supportingAgents.join(", ")}`
        : isCrossSourceAgreement
          ? `분석 에이전트-정적 검증 일치: ${supportingAgents.join(", ")}`
          : `추가 검토 필요: ${supportingAgents[0]} 단독 제기`;
      return {
        ...best.finding,
        confidence: roundConfidence(adjustedConfidence),
        recommendation: `${mergeLabel}. ${best.finding.recommendation}`,
        codeEvidence:
          providers.includes("heuristic") && !isModelConsensus
            ? `${best.finding.codeEvidence} 휴리스틱 fallback 결과이므로 실제 provider 분석으로 재검증하는 것이 좋습니다.`
            : providers.includes("static_validation") && !isCrossSourceAgreement
              ? `${best.finding.codeEvidence} 정적 검증 단독 후보이므로 문서 작성 에이전트가 추가 검토 필요 항목으로만 다뤄야 합니다.`
            : best.finding.codeEvidence,
      } satisfies ReportFinding;
    })
    .filter((finding) => findingMatchesBasis(finding, input))
    .sort(compareFindings)
    .slice(0, 12);

  const consensusCount = findings.filter(
    (finding) =>
      finding.recommendation.includes("멀티 에이전트 합의") ||
      finding.recommendation.includes("분석 에이전트-정적 검증 일치"),
  ).length;
  const needsReviewCount = findings.length - consensusCount;
  return {
    summary:
      findings.length > 0
        ? `문서 작성 에이전트가 ${reportInputSummary(agentReports)}를 병합해 ${findings.length}개 의심 항목을 정리했습니다. 합의 항목 ${consensusCount}개, 추가 검토 필요 항목 ${needsReviewCount}개입니다.`
        : `문서 작성 에이전트가 ${reportInputSummary(agentReports)}를 병합했지만 의미 있는 문서-코드 불일치 항목을 찾지 못했습니다.`,
    findings,
  };
}

function normalizeReportWriterOutput(report: AnalysisReport, input: ReportWriterInput): AnalysisReport {
  const deterministicMerge = mergeAgentReports(input.agentReports, input);
  const deterministicByKey = new Map(deterministicMerge.findings.map((finding) => [mergeFindingKey(finding), finding]));
  const normalizedFindings = report.findings
    .map((finding) => {
      const matched = deterministicByKey.get(mergeFindingKey(finding));
      if (!matched) {
        return {
          ...finding,
          confidence: Math.min(0.65, finding.confidence),
          recommendation: finding.recommendation.includes("추가 검토 필요")
            ? finding.recommendation
            : `추가 검토 필요: 문서 작성 에이전트가 단독으로 병합한 항목입니다. ${finding.recommendation}`,
        } satisfies ReportFinding;
      }
      const hasMergeLabel =
        finding.recommendation.includes("멀티 에이전트 합의") ||
        finding.recommendation.includes("분석 에이전트-정적 검증 일치") ||
        finding.recommendation.includes("추가 검토 필요");
      return {
        ...finding,
        confidence: Math.min(finding.confidence, matched.confidence),
        recommendation: hasMergeLabel ? finding.recommendation : matched.recommendation,
      } satisfies ReportFinding;
    })
    .filter((finding) => findingMatchesBasis(finding, input))
    .sort(compareFindings)
    .slice(0, 12);

  return {
    summary: `${report.summary} 문서 작성 에이전트가 분석 계획과 ${reportInputSummary(input.agentReports)}를 입력으로 최종 리포트를 작성했습니다.`,
    findings: normalizedFindings,
  };
}

function createStaticValidationReport(input: AnalyzeInput): AnalysisAgentResult | null {
  if (input.comparisonBasis === "unknown") {
    return null;
  }

  const heuristicReport = heuristicAnalyze({
    ...input,
    reason: "정적 endpoint/function 신호로 만든 문서 작성 에이전트 검토 후보입니다.",
  });
  if (!heuristicReport.findings.length) return null;

  return {
    agentId: "static-validation",
    provider: "static_validation",
    report: heuristicReport,
  };
}

function mergeFindingKey(finding: ReportFinding) {
  const codeLocation = finding.codeLocations?.[0];
  if (codeLocation?.endpoint) {
    return [finding.type, "endpoint", codeLocation.endpoint.method, codeLocation.endpoint.path].join(":");
  }
  if (codeLocation?.path) {
    return [
      finding.type,
      "code",
      codeLocation.path,
      codeLocation.symbolName ?? "",
      codeLocation.startLine ?? "",
    ].join(":");
  }
  if (finding.documentLocation?.matchedText) {
    return [
      finding.type,
      "doc",
      finding.documentLocation.documentName ?? "",
      normalizeKeyText(finding.documentLocation.matchedText).slice(0, 120),
    ].join(":");
  }
  return [finding.type, normalizeKeyText(finding.title)].join(":");
}

function providerHasKey(provider: Provider, credentials?: ProviderCredentials) {
  if (providerRequestKey(provider, credentials)) return true;
  return provider === "openai" ? Boolean(process.env.OPENAI_API_KEY) : Boolean(process.env.GEMINI_API_KEY);
}

function providerRequestKey(provider: Provider, credentials?: ProviderCredentials) {
  return provider === "openai" ? credentials?.openaiApiKey : credentials?.geminiApiKey;
}

function providerLabel(provider: Provider) {
  return provider === "openai" ? "OpenAI" : "Gemini";
}

function detectionTypesFor(comparisonBasis: ComparisonBasis, options: AnalysisOptions): FindingType[] {
  if (comparisonBasis === "code_latest") return ["outdated_doc"];
  if (comparisonBasis === "document_latest") {
    return ["missing_feature", ...(options.apiMismatch ? ["api_mismatch" as const] : [])];
  }
  return [
    ...(options.missingFeature ? ["missing_feature" as const] : []),
    ...(options.apiMismatch ? ["api_mismatch" as const] : []),
    ...(options.outdatedDoc ? ["outdated_doc" as const] : []),
  ];
}

function compactText(value: string, max: number) {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > max ? `${compacted.slice(0, max)}...` : compacted;
}

function rankCandidatePaths(requirement: string, paths: string[]) {
  const terms = tokenize(requirement);
  return [...paths]
    .map((path) => ({
      path,
      score: terms.reduce((sum, term) => sum + (path.toLowerCase().includes(term) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .filter((item, index) => item.score > 0 || index < 5)
    .map((item) => item.path);
}

function tokenize(value: string) {
  return unique(
    value
      .toLowerCase()
      .split(/[^a-z0-9가-힣]+/i)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3),
  ).slice(0, 20);
}

function normalizeKeyText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function findingMatchesBasis(finding: ReportFinding, input: AnalyzeInput) {
  return filterReportByOptions({ summary: "", findings: [finding] }, input.options, input.comparisonBasis).findings.length > 0;
}

function compareFindings(a: ReportFinding, b: ReportFinding) {
  const severityRank = { high: 0, medium: 1, low: 2 };
  const consensusRank = (finding: ReportFinding) =>
    finding.recommendation.includes("멀티 에이전트 합의") ||
    finding.recommendation.includes("분석 에이전트-정적 검증 일치")
      ? 0
      : 1;
  return (
    consensusRank(a) - consensusRank(b) ||
    severityRank[a.severity] - severityRank[b.severity] ||
    b.confidence - a.confidence
  );
}

function roundConfidence(value: number) {
  return Math.round(value * 100) / 100;
}

function reportInputSummary(agentReports: AnalysisAgentResult[]) {
  const modelReportCount = agentReports.filter((agent) => agent.provider !== "static_validation").length;
  const staticReportCount = agentReports.length - modelReportCount;
  return staticReportCount > 0
    ? `분석 에이전트 결과 ${modelReportCount}개와 정적 검증 후보 ${staticReportCount}개`
    : `분석 에이전트 결과 ${modelReportCount}개`;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
