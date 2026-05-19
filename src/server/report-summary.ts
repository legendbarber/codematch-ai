import type { FindingType, Severity } from "./types";

export type SerializableFinding = {
  type: string;
  severity: string;
  title: string;
  documentEvidence: string;
  codeEvidence: string;
  recommendation: string;
  confidence: number;
};

export type ReportRecommendationSummary = {
  headline: string;
  priorityActions: string[];
  reviewFocus: string[];
};

export function createReportRecommendationSummary(
  findings: SerializableFinding[],
): ReportRecommendationSummary {
  const highCount = findings.filter((finding) => finding.severity === "high").length;
  const mediumCount = findings.filter((finding) => finding.severity === "medium").length;
  const topFindings = [...findings].sort(compareFindingPriority).slice(0, 3);

  if (findings.length === 0) {
    return {
      headline: "중요 불일치 항목은 발견되지 않았습니다. 최종 제출 전 핵심 API와 README만 수동으로 한 번 더 확인하세요.",
      priorityActions: [
        "업로드한 요구사항 문서의 핵심 기능 목록과 실제 README/API 문서를 대조하세요.",
        "주요 route, 응답 필드, 인증 흐름이 최신 코드 기준으로 설명되어 있는지 확인하세요.",
        "배포 전 동일 저장소로 한 번 더 분석을 실행해 회귀 여부를 점검하세요.",
      ],
      reviewFocus: ["주요 API 경로", "인증/권한 흐름", "README 최신성"],
    };
  }

  return {
    headline: `${findings.length}개의 정합성 의심 항목이 발견되었습니다. High ${highCount}건, Medium ${mediumCount}건을 먼저 처리하세요.`,
    priorityActions: topFindings.map((finding, index) => {
      const prefix = `${index + 1}. ${typeLabel(finding.type)} / ${severityLabel(finding.severity)}`;
      return `${prefix}: ${finding.recommendation}`;
    }),
    reviewFocus: unique([
      ...topFindings.map((finding) => typeLabel(finding.type)),
      ...topFindings.map((finding) => severityLabel(finding.severity)),
    ]).slice(0, 5),
  };
}

function compareFindingPriority(a: SerializableFinding, b: SerializableFinding) {
  const severityDelta = severityRank(b.severity) - severityRank(a.severity);
  if (severityDelta !== 0) return severityDelta;
  return b.confidence - a.confidence;
}

function severityRank(severity: string) {
  const ranks: Record<Severity, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };
  return ranks[severity as Severity] ?? 0;
}

function severityLabel(severity: string) {
  const labels: Record<Severity, string> = {
    high: "높은 우선순위",
    medium: "중간 우선순위",
    low: "낮은 우선순위",
  };
  return labels[severity as Severity] ?? severity;
}

function typeLabel(type: string) {
  const labels: Record<FindingType, string> = {
    missing_feature: "기능 누락",
    api_mismatch: "API 불일치",
    outdated_doc: "Outdated 문서",
  };
  return labels[type as FindingType] ?? type;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
