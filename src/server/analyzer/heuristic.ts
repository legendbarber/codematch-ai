import { extractEndpointSignals } from "../chunker";
import type {
  AnalysisOptions,
  AnalysisReport,
  CodeChunk,
  ParsedDocument,
  ReportFinding,
  RepositorySnapshot,
} from "../types";

type HeuristicInput = {
  repository: RepositorySnapshot;
  documents: ParsedDocument[];
  chunks: CodeChunk[];
  options: AnalysisOptions;
  reason?: string;
};

const FEATURE_KEYWORDS = [
  { label: "로그인", terms: ["로그인", "login", "sign in", "signin", "auth"] },
  { label: "회원가입", terms: ["회원가입", "register", "sign up", "signup"] },
  { label: "이메일 인증", terms: ["이메일 인증", "email verification", "verify email"] },
  { label: "파일 업로드", terms: ["파일 업로드", "file upload", "upload"] },
  { label: "검색", terms: ["검색", "search"] },
  { label: "결제", terms: ["결제", "payment", "billing"] },
  { label: "히스토리", terms: ["히스토리", "history", "audit"] },
];

export function heuristicAnalyze({
  repository,
  documents,
  chunks,
  options,
  reason,
}: HeuristicInput): AnalysisReport {
  const docText = documents.map((document) => document.text).join("\n").toLowerCase();
  const codeText = chunks.map((chunk) => chunk.text).join("\n").toLowerCase();
  const findings: ReportFinding[] = [];

  if (options.apiMismatch) {
    findings.push(...findEndpointMismatches(documents, chunks));
  }

  if (options.missingFeature) {
    for (const feature of FEATURE_KEYWORDS) {
      const documentMentions = feature.terms.some((term) => docText.includes(term.toLowerCase()));
      const codeMentions = feature.terms.some((term) => codeText.includes(term.toLowerCase()));
      if (documentMentions && !codeMentions) {
        findings.push({
          type: "missing_feature",
          severity: feature.label === "로그인" || feature.label === "회원가입" ? "medium" : "low",
          title: `${feature.label} 구현 흔적 부족`,
          documentEvidence: `${feature.label} 관련 요구가 문서에 언급되어 있습니다.`,
          codeEvidence: `수집된 ${repository.files.length}개 파일에서 ${feature.label} 관련 명확한 구현 키워드를 찾지 못했습니다.`,
          relatedFiles: closestFiles(chunks, feature.terms),
          recommendation: `${feature.label} 요구사항이 실제 범위라면 관련 route, service, test를 추가하거나 문서에서 범위를 조정하세요.`,
          confidence: 0.58,
        });
      }
    }
  }

  if (options.outdatedDoc) {
    const codeEndpoints = unique(chunks.flatMap((chunk) => extractEndpointSignals(chunk.text)));
    const docsMentionApi = /api|endpoint|route|rest|graphql|응답|요청/i.test(docText);
    if (codeEndpoints.length >= 3 && !docsMentionApi) {
      findings.push({
        type: "outdated_doc",
        severity: "low",
        title: "코드의 API 엔드포인트 대비 문서 설명 부족",
        documentEvidence: "업로드 문서에서 API 경로 또는 응답 형식 설명이 충분히 발견되지 않았습니다.",
        codeEvidence: `코드에서는 ${codeEndpoints.slice(0, 5).join(", ")} 등의 엔드포인트가 감지되었습니다.`,
        relatedFiles: chunksWithEndpoints(chunks).slice(0, 5),
        recommendation: "문서에 주요 API 경로, 메서드, 요청/응답 필드를 추가해 최신 상태를 유지하세요.",
        confidence: 0.52,
      });
    }
  }

  const deduped = dedupeFindings(findings).slice(0, 8);
  return {
    summary:
      deduped.length > 0
        ? `${repository.owner}/${repository.repo}에서 ${deduped.length}개의 문서-코드 정합성 의심 항목을 찾았습니다.${
            reason ? ` (${reason})` : ""
          }`
        : `${repository.owner}/${repository.repo}에서 높은 신뢰도의 불일치 항목을 찾지 못했습니다.${
            reason ? ` ${reason}` : ""
          }`,
    findings: deduped,
  };
}

function findEndpointMismatches(documents: ParsedDocument[], chunks: CodeChunk[]): ReportFinding[] {
  const documentEndpoints = unique(documents.flatMap((document) => extractEndpointSignals(document.text)));
  const codeEndpoints = unique(chunks.flatMap((chunk) => extractEndpointSignals(chunk.text)));
  const codeEndpointSet = new Set(codeEndpoints.map(normalizeEndpoint));
  const findings: ReportFinding[] = [];

  for (const endpoint of documentEndpoints.slice(0, 8)) {
    if (!codeEndpointSet.has(normalizeEndpoint(endpoint))) {
      findings.push({
        type: "api_mismatch",
        severity: "high",
        title: `${endpoint} API 구현 불일치 가능성`,
        documentEvidence: `문서에 ${endpoint} 엔드포인트가 명시되어 있습니다.`,
        codeEvidence: "수집된 route/controller 코드에서 동일한 경로를 찾지 못했습니다.",
        relatedFiles: chunksWithEndpoints(chunks).slice(0, 5),
        recommendation: "문서의 API 경로가 최신인지 확인하고, 실제 구현 경로 또는 누락된 route를 맞추세요.",
        confidence: 0.72,
      });
    }
  }

  return findings;
}

function normalizeEndpoint(endpoint: string) {
  return endpoint
    .replace(/\{[^}]+}/g, ":param")
    .replace(/:[^/]+/g, ":param")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function chunksWithEndpoints(chunks: CodeChunk[]) {
  return unique(
    chunks
      .filter((chunk) => extractEndpointSignals(chunk.text).length > 0)
      .map((chunk) => chunk.path),
  );
}

function closestFiles(chunks: CodeChunk[], terms: string[]) {
  const lowerTerms = terms.map((term) => term.toLowerCase());
  return unique(
    chunks
      .filter((chunk) => lowerTerms.some((term) => chunk.path.toLowerCase().includes(term)))
      .map((chunk) => chunk.path),
  ).slice(0, 4);
}

function dedupeFindings(findings: ReportFinding[]) {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.type}:${finding.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
