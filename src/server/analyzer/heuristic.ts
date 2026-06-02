import { extractEndpointLocations, extractEndpointSignals } from "../chunker";
import type {
  AnalysisOptions,
  AnalysisReport,
  CodeChunk,
  CodeLocation,
  ComparisonBasis,
  ParsedDocument,
  ReportFinding,
  RepositorySnapshot,
} from "../types";

type HeuristicInput = {
  repository: RepositorySnapshot;
  documents: ParsedDocument[];
  chunks: CodeChunk[];
  options: AnalysisOptions;
  comparisonBasis?: ComparisonBasis;
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

const COMMON_SYMBOLS = new Set([
  "async",
  "await",
  "callback",
  "console",
  "constructor",
  "create",
  "delete",
  "error",
  "event",
  "fetch",
  "function",
  "handler",
  "import",
  "input",
  "json",
  "middleware",
  "params",
  "promise",
  "query",
  "request",
  "response",
  "return",
  "router",
  "string",
  "update",
  "value",
]);

export function heuristicAnalyze({
  repository,
  documents,
  chunks,
  options,
  comparisonBasis = "unknown",
  reason,
}: HeuristicInput): AnalysisReport {
  const documentChunks = documents.flatMap((document) => document.chunks);
  const docText = documentChunks.map((chunk) => chunk.text).join("\n").toLowerCase();
  const codeText = chunks.map((chunk) => chunk.text).join("\n").toLowerCase();
  const findings: ReportFinding[] = [];

  if (options.missingFeature && comparisonBasis !== "code_latest") {
    findings.push(...findDocumentBaselineMissingFeatures(repository, documents, chunks));

    for (const feature of FEATURE_KEYWORDS) {
      const documentMentions = feature.terms.some((term) => docText.includes(term.toLowerCase()));
      const codeMentions = feature.terms.some((term) => codeText.includes(term.toLowerCase()));
      if (documentMentions && !codeMentions) {
        findings.push({
          type: "missing_feature",
          severity: feature.label === "로그인" || feature.label === "회원가입" ? "high" : "low",
          title: `${feature.label} 구현 흔적 부족`,
          documentEvidence: `${feature.label} 관련 요구가 문서에 언급되어 있습니다.`,
          codeEvidence: `수집된 ${repository.files.length}개 파일에서 ${feature.label} 관련 명확한 구현 키워드를 찾지 못했습니다.`,
          relatedFiles: closestFiles(chunks, feature.terms),
          documentLocation: closestDocumentLocation(documents, feature.terms),
          codeLocations: closestCodeLocations(chunks, feature.terms),
          recommendation: `${feature.label} 요구사항이 실제 범위라면 관련 route, service, test를 추가하거나 문서에서 범위를 조정하세요.`,
          confidence: 0.58,
        });
      }
    }
  }

  if (options.apiMismatch && comparisonBasis !== "code_latest") {
    findings.push(...findEndpointMismatches(documents, chunks));
  }

  if (options.outdatedDoc && comparisonBasis !== "document_latest") {
    findings.push(...findCodeBaselineUndocumentedFeatures(documents, chunks));

    const codeEndpointLocations = chunks.flatMap((chunk) => endpointLocationsForChunk(chunk));
    const codeEndpoints = unique(codeEndpointLocations.map(formatEndpointLocation));
    const docsMentionApi = /api|endpoint|route|rest|graphql|응답|요청/i.test(docText);
    if (codeEndpoints.length >= 3 && !docsMentionApi) {
      findings.push({
        type: "outdated_doc",
        severity: "low",
        title: "코드의 API 엔드포인트 대비 문서 설명 부족",
        documentEvidence: "업로드 문서에서 API 경로 또는 응답 형식 설명이 충분히 발견되지 않았습니다.",
        codeEvidence: `코드에서는 ${codeEndpoints.slice(0, 5).join(", ")} 등의 엔드포인트가 감지되었습니다.`,
        relatedFiles: chunksWithEndpoints(chunks).slice(0, 5),
        codeLocations: codeEndpointLocations.slice(0, 5),
        recommendation: "휴리스틱 분석 기반 결과입니다. 문서에 주요 API 경로, 메서드, 요청/응답 필드를 추가할지 검토하세요.",
        confidence: 0.52,
      });
    }
  }

  const deduped = dedupeFindings(findings, comparisonBasis).slice(0, 8);
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
  const documentEndpoints = unique(
    documents.flatMap((document) => document.chunks.flatMap((chunk) => extractEndpointSignals(chunk.text))),
  );
  const codeEndpoints = unique(chunks.flatMap((chunk) => extractEndpointSignals(chunk.text)));
  const codeEndpointSet = new Set(codeEndpoints.map(normalizeEndpoint));
  const findings: ReportFinding[] = [];

  for (const endpoint of documentEndpoints.slice(0, 8)) {
    if (!codeEndpointSet.has(normalizeEndpoint(endpoint))) {
      findings.push({
        type: "api_mismatch",
        severity: "high",
        title: `${endpoint} API 구현 불일치 가능성`,
        documentEvidence: documentEvidenceFor(documents, endpoint) ?? `문서에 ${endpoint} 엔드포인트가 명시되어 있습니다.`,
        codeEvidence: "수집된 route/controller 코드 범위에서 동일한 경로의 구현 근거를 확인하지 못했습니다.",
        relatedFiles: chunksWithEndpoints(chunks).slice(0, 5),
        documentLocation: closestDocumentLocation(documents, [endpoint]),
        recommendation: "문서의 API 경로가 최신인지 확인하고, 실제 구현 경로 또는 누락된 route를 맞추세요.",
        confidence: 0.72,
      });
    }
  }

  return findings;
}

function findDocumentBaselineMissingFeatures(
  repository: RepositorySnapshot,
  documents: ParsedDocument[],
  chunks: CodeChunk[],
): ReportFinding[] {
  const codeText = chunks.map((chunk) => chunk.text).join("\n");
  const codeEndpointSet = new Set(
    chunks.flatMap((chunk) => extractEndpointSignals(chunk.text, chunk.path)).map(normalizeEndpoint),
  );
  const findings: ReportFinding[] = [];

  for (const candidate of documentEndpointCandidates(documents).slice(0, 10)) {
    if (codeEndpointSet.has(normalizeEndpoint(candidate.endpoint))) continue;
    findings.push({
      type: "missing_feature",
      severity: "high",
      title: `${candidate.endpoint} 코드 반영 근거 미확인`,
      documentEvidence: candidate.evidence,
      codeEvidence: `수집·분석된 ${repository.files.length}개 코드 파일 범위에서 ${candidate.endpoint} 구현 근거를 확인하지 못했습니다.`,
      relatedFiles: chunksWithEndpoints(chunks).slice(0, 5),
      documentLocation: {
        documentName: candidate.documentName,
        pageNumber: candidate.pageNumber,
        matchedText: candidate.evidence,
      },
      codeLocations: chunksWithEndpoints(chunks).slice(0, 5).map((path) => ({ path })),
      recommendation: "문서가 최신 기준이라면 해당 endpoint 또는 기능 흐름을 코드에 구현했는지 확인하세요. 휴리스틱 분석 기반 결과입니다.",
      confidence: 0.7,
    });
  }

  const codeSymbolSet = new Set(
    extractCodeSymbolCandidates(chunks)
      .map((candidate) => candidate.symbolName?.toLowerCase())
      .filter((value): value is string => Boolean(value)),
  );
  for (const candidate of documentSymbolCandidates(documents).slice(0, 10)) {
    if (codeSymbolSet.has(candidate.name.toLowerCase())) continue;
    if (normalizedIncludes(codeText, candidate.name)) continue;
    findings.push({
      type: "missing_feature",
      severity: "high",
      title: `${humanizeSymbol(candidate.name)} 구현 근거 미확인`,
      documentEvidence: candidate.evidence,
      codeEvidence: `수집·분석된 코드 범위에서 ${candidate.name} 또는 같은 이름의 구현 symbol을 확인하지 못했습니다.`,
      relatedFiles: closestFiles(chunks, [candidate.name]),
      documentLocation: {
        documentName: candidate.documentName,
        pageNumber: candidate.pageNumber,
        matchedText: candidate.evidence,
      },
      codeLocations: closestCodeLocations(chunks, [candidate.name]),
      recommendation: "문서가 최신 기준이라면 해당 기능의 service, route, test 구현 여부를 확인하세요. 휴리스틱 분석 기반 결과입니다.",
      confidence: 0.66,
    });
  }

  return findings;
}

function findCodeBaselineUndocumentedFeatures(documents: ParsedDocument[], chunks: CodeChunk[]): ReportFinding[] {
  const documentText = documents.flatMap((document) => document.chunks.map((chunk) => chunk.text)).join("\n");
  const documentEndpointSet = new Set(documentEndpointCandidates(documents).map((candidate) => normalizeEndpoint(candidate.endpoint)));
  const findings: ReportFinding[] = [];

  const endpointLocations = dedupeCodeLocations(chunks.flatMap((chunk) => endpointLocationsForChunk(chunk))).sort(
    (a, b) => rankCodeEndpointLocation(b) - rankCodeEndpointLocation(a),
  );
  for (const location of endpointLocations.slice(0, 12)) {
    const endpoint = formatEndpointLocation(location);
    if (documentEndpointSet.has(normalizeEndpoint(endpoint))) continue;
    if (normalizedIncludes(documentText, location.endpoint?.path ?? endpoint)) continue;
    findings.push({
      type: "outdated_doc",
      severity: "high",
      title: `${endpoint} 문서 반영 필요`,
      documentEvidence: "업로드된 문서에서 해당 endpoint 또는 기능 설명을 찾지 못했습니다.",
      codeEvidence: codeEvidenceForLocation(chunks, location),
      relatedFiles: [location.path],
      codeLocations: [location],
      recommendation: "코드가 최신 기준이라면 이 구현 기능을 기술 문서의 API/기능 설명 섹션에 추가하세요. 휴리스틱 분석 기반 결과입니다.",
      confidence: 0.7,
    });
  }

  const documentedSymbols = new Set(documentSymbolCandidates(documents).map((candidate) => candidate.name.toLowerCase()));
  for (const candidate of extractCodeSymbolCandidates(chunks).slice(0, 20)) {
    const symbolName = candidate.symbolName;
    if (!symbolName) continue;
    if (documentedSymbols.has(symbolName.toLowerCase())) continue;
    if (normalizedIncludes(documentText, symbolName)) continue;
    if (findings.some((finding) => finding.relatedFiles.includes(candidate.path))) continue;
    findings.push({
      type: "outdated_doc",
      severity: "low",
      title: `${humanizeSymbol(symbolName)} 문서 반영 필요`,
      documentEvidence: "업로드된 문서에서 해당 함수 또는 기능 설명을 찾지 못했습니다.",
      codeEvidence: codeEvidenceForLocation(chunks, candidate),
      relatedFiles: [candidate.path],
      codeLocations: [candidate],
      recommendation: "코드가 최신 기준이라면 해당 함수가 담당하는 동작을 문서에 추가할지 검토하세요. 휴리스틱 분석 기반 결과입니다.",
      confidence: 0.58,
    });
  }

  return findings;
}

function normalizeEndpoint(endpoint: string) {
  return endpoint
    .replace(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/i, "")
    .replace(/\{[^}]+}/g, ":param")
    .replace(/:[^/]+/g, ":param")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function chunksWithEndpoints(chunks: CodeChunk[]) {
  return unique(
    chunks
      .filter((chunk) => extractEndpointSignals(chunk.text, chunk.path).length > 0)
      .map((chunk) => chunk.path),
  );
}

function endpointLocationsForChunk(chunk: CodeChunk): CodeLocation[] {
  return extractEndpointLocations(chunk.text, chunk.path).flatMap((location) => {
    if (!location.endpoint) return [];
    return [
      {
        path: chunk.path,
        symbolName: location.endpoint.method,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        endpoint: location.endpoint,
      },
    ];
  });
}

function formatEndpointLocation(location: CodeLocation) {
  if (!location.endpoint) return location.path;
  return `${location.endpoint.method} ${location.endpoint.path}`;
}

function closestFiles(chunks: CodeChunk[], terms: string[]) {
  const lowerTerms = terms.map((term) => term.toLowerCase());
  return unique(
    chunks
      .filter((chunk) => lowerTerms.some((term) => chunk.path.toLowerCase().includes(term)))
      .map((chunk) => chunk.path),
  ).slice(0, 4);
}

function closestCodeLocations(chunks: CodeChunk[], terms: string[]): CodeLocation[] {
  return closestFiles(chunks, terms).map((path) => {
    const chunk = chunks.find((candidate) => candidate.path === path);
    return {
      path,
      startLine: chunk?.startLine,
      endLine: chunk?.endLine,
    };
  });
}

function closestDocumentLocation(documents: ParsedDocument[], terms: string[]) {
  const lowerTerms = terms.map((term) => term.toLowerCase());
  for (const document of documents) {
    const chunk = document.chunks.find((candidate) =>
      lowerTerms.some((term) => candidate.text.toLowerCase().includes(term)),
    );
    if (chunk) {
      return {
        documentName: document.name,
        pageNumber: chunk.pageNumber,
        matchedText: chunk.text.slice(0, 500),
      };
    }
  }
  return undefined;
}

type DocumentCandidate = {
  name: string;
  evidence: string;
  documentName: string;
  pageNumber?: number;
};

function documentEndpointCandidates(documents: ParsedDocument[]) {
  const candidates: Array<DocumentCandidate & { endpoint: string }> = [];
  const seen = new Set<string>();
  for (const document of documents) {
    for (const chunk of document.chunks) {
      for (const endpoint of extractEndpointSignals(chunk.text)) {
        const normalized = normalizeEndpoint(endpoint);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        candidates.push({
          name: endpoint,
          endpoint,
          evidence: evidenceAround(chunk.text, endpoint),
          documentName: document.name,
          pageNumber: chunk.pageNumber,
        });
      }
    }
  }
  return candidates;
}

function documentSymbolCandidates(documents: ParsedDocument[]): DocumentCandidate[] {
  const candidates: DocumentCandidate[] = [];
  const seen = new Set<string>();
  const symbolPattern = /\b([A-Za-z_$][\w$]{4,})\s*\(/g;
  const inlineCodePattern = /`([A-Za-z_$][\w$]{4,})`/g;

  for (const document of documents) {
    for (const chunk of document.chunks) {
      for (const pattern of [symbolPattern, inlineCodePattern]) {
        pattern.lastIndex = 0;
        for (const match of chunk.text.matchAll(pattern)) {
          const name = match[1];
          if (!isMeaningfulSymbol(name) || seen.has(name.toLowerCase())) continue;
          seen.add(name.toLowerCase());
          candidates.push({
            name,
            evidence: evidenceAround(chunk.text, name),
            documentName: document.name,
            pageNumber: chunk.pageNumber,
          });
        }
      }
    }
  }
  return candidates;
}

function extractCodeSymbolCandidates(chunks: CodeChunk[]): CodeLocation[] {
  const candidates: CodeLocation[] = [];
  const seen = new Set<string>();
  const patterns = [
    /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]{4,})\s*\(/g,
    /\bfunction\s+([A-Za-z_$][\w$]{4,})\s*\(/g,
    /\bexport\s+class\s+([A-Za-z_$][\w$]{4,})\b/g,
    /\bclass\s+([A-Za-z_$][\w$]{4,})\b/g,
    /\bexport\s+const\s+([A-Za-z_$][\w$]{4,})\s*=/g,
  ];

  for (const chunk of chunks) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      for (const match of chunk.text.matchAll(pattern)) {
        const name = match[1];
        if (!isMeaningfulSymbol(name)) continue;
        const key = `${chunk.path}:${name.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({
          path: chunk.path,
          symbolName: name,
          startLine: lineForOffset(chunk, match.index ?? 0),
          endLine: chunk.endLine,
        });
      }
    }
  }

  return candidates;
}

function lineForOffset(chunk: CodeChunk, offset: number) {
  const prefix = chunk.text.slice(0, offset);
  return chunk.startLine + prefix.split(/\r?\n/).length - 1;
}

function codeEvidenceForLocation(chunks: CodeChunk[], location: CodeLocation) {
  const chunk = chunks.find((candidate) => candidate.path === location.path);
  const locationText = location.endpoint
    ? `${location.endpoint.method} ${location.endpoint.path}`
    : location.symbolName ?? location.path;
  const snippet = chunk ? snippetAround(chunk.text, location.endpoint?.path ?? location.symbolName ?? locationText) : "";
  return `${location.path}${location.startLine ? `:${location.startLine}` : ""}${
    location.endLine ? `-${location.endLine}` : ""
  }에서 ${locationText} 구현 근거를 확인했습니다.${snippet ? `\n\n${snippet}` : ""}`;
}

function documentEvidenceFor(documents: ParsedDocument[], term: string) {
  for (const document of documents) {
    for (const chunk of document.chunks) {
      if (normalizeLoose(chunk.text).includes(normalizeLoose(term))) {
        return evidenceAround(chunk.text, term);
      }
    }
  }
  return null;
}

function evidenceAround(text: string, term: string) {
  return snippetAround(text, term, 700);
}

function snippetAround(text: string, term: string, maxLength = 700) {
  const directIndex = text.toLowerCase().indexOf(term.toLowerCase());
  if (directIndex >= 0) {
    const start = Math.max(0, directIndex - Math.floor(maxLength / 3));
    const end = Math.min(text.length, start + maxLength);
    return text.slice(start, end).trim();
  }

  const normalizedTerm = normalizeLoose(term);
  const normalizedText = normalizeLoose(text);
  const normalizedIndex = normalizedText.indexOf(normalizedTerm);
  const rawIndex = normalizedIndex >= 0 ? approximateRawIndex(text, normalizedText, normalizedIndex) : 0;
  const start = Math.max(0, rawIndex - Math.floor(maxLength / 3));
  const end = Math.min(text.length, start + maxLength);
  return text.slice(start, end).trim();
}

function approximateRawIndex(rawText: string, normalizedText: string, normalizedIndex: number) {
  if (normalizedIndex <= 0) return 0;
  const ratio = rawText.length / Math.max(1, normalizedText.length);
  return Math.min(rawText.length - 1, Math.floor(normalizedIndex * ratio));
}

function normalizedIncludes(text: string, value: string) {
  return normalizeLoose(text).includes(normalizeLoose(value));
}

function normalizeLoose(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9가-힣/_:-]+/g, "");
}

function isMeaningfulSymbol(name: string) {
  if (name.length < 5) return false;
  if (COMMON_SYMBOLS.has(name.toLowerCase())) return false;
  if (/^[A-Z_]+$/.test(name)) return false;
  return /[A-Z]/.test(name) || /(plan|policy|service|manager|controller|handler|feature|workflow)$/i.test(name);
}

function humanizeSymbol(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
}

function dedupeCodeLocations(locations: CodeLocation[]) {
  const seen = new Set<string>();
  return locations.filter((location) => {
    const key = location.endpoint
      ? `${location.endpoint.method}:${normalizeEndpoint(location.endpoint.path)}`
      : `${location.path}:${location.symbolName ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeFindings(findings: ReportFinding[], comparisonBasis: ComparisonBasis) {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = findingDedupeKey(finding, comparisonBasis);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findingDedupeKey(finding: ReportFinding, comparisonBasis: ComparisonBasis) {
  const endpoint = finding.title.match(/(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)?\s*(\/[^\s]+)/i)?.[1];
  if (comparisonBasis !== "unknown" && endpoint) return `endpoint:${normalizeEndpoint(endpoint)}`;
  return `${finding.type}:${finding.title.toLowerCase()}`;
}

function rankCodeEndpointLocation(location: CodeLocation) {
  const path = location.endpoint?.path.toLowerCase() ?? "";
  let score = 0;
  if (path.includes("intervention") || path.includes("recommend") || path.includes("plan")) score += 30;
  if (path.includes("risk") || path.includes("ai")) score += 12;
  if ((path.match(/:/g) ?? []).length > 0) score += 5;
  if (path.split("/").filter(Boolean).length >= 3) score += 4;
  if (path.includes("debug")) score -= 20;
  if (path === "/health") score -= 15;
  return score;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
