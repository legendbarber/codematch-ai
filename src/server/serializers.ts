import { createReportRecommendationSummary } from "./report-summary";

type AnalysisWithRelations = {
  id: string;
  repoUrl: string;
  repoOwner: string | null;
  repoName: string | null;
  provider: string;
  optionsJson: string;
  status: string;
  summary: string | null;
  totalsJson: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  documents?: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    extractedChars: number;
  }>;
  steps?: Array<{
    id: string;
    order: number;
    key: string;
    label: string;
    status: string;
    message: string | null;
    durationMs: number | null;
  }>;
  findings?: Array<{
    id: string;
    type: string;
    severity: string;
    title: string;
    documentEvidence: string;
    codeEvidence: string;
    relatedFilesJson: string;
    recommendation: string;
    confidence: number;
  }>;
};

export function serializeAnalysis(analysis: AnalysisWithRelations) {
  const findings =
    analysis.findings?.map((finding) => ({
      ...finding,
      relatedFiles: parseJson(finding.relatedFilesJson, []),
      relatedFilesJson: undefined,
    })) ?? [];

  return {
    ...analysis,
    options: parseJson(analysis.optionsJson, {}),
    totals: parseJson(analysis.totalsJson, defaultTotals()),
    reportRecommendationSummary: createReportRecommendationSummary(findings),
    relatedFilesJson: undefined,
    optionsJson: undefined,
    totalsJson: undefined,
    createdAt: analysis.createdAt.toISOString(),
    updatedAt: analysis.updatedAt.toISOString(),
    completedAt: analysis.completedAt?.toISOString() ?? null,
    findings,
    documents: analysis.documents ?? [],
    steps: analysis.steps ?? [],
  };
}

export function serializeAnalysisSummary(analysis: AnalysisWithRelations) {
  return {
    id: analysis.id,
    repoUrl: analysis.repoUrl,
    repoOwner: analysis.repoOwner,
    repoName: analysis.repoName,
    provider: analysis.provider,
    status: analysis.status,
    summary: analysis.summary,
    error: analysis.error,
    totals: parseJson(analysis.totalsJson, defaultTotals()),
    createdAt: analysis.createdAt.toISOString(),
    updatedAt: analysis.updatedAt.toISOString(),
    completedAt: analysis.completedAt?.toISOString() ?? null,
  };
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function defaultTotals() {
  return {
    total: 0,
    missingFeature: 0,
    apiMismatch: 0,
    outdatedDoc: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
}
