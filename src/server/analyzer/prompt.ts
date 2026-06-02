import { summarizeCodeSignals } from "../chunker";
import type { LoadedDetectionDoc } from "./detection-docs";
import type { LoadedPromptDoc } from "./prompt-docs";
import type { AnalysisPlan, CodeChunk, ComparisonBasis, ParsedDocument, Provider, RepositorySnapshot } from "../types";

const MAX_ANALYSIS_CODE_CHUNKS = 70;

type PromptInput = {
  repository: RepositorySnapshot;
  documents: ParsedDocument[];
  chunks: CodeChunk[];
  comparisonBasis: ComparisonBasis;
  analysisPlan?: AnalysisPlan;
  promptDocs?: LoadedPromptDoc[];
  detectionDocs?: LoadedDetectionDoc[];
  agentId?: string;
  provider?: Provider;
};

type PlanningPromptInput = Omit<PromptInput, "analysisPlan" | "agentId" | "provider">;

type ReportWriterPromptInput = {
  repository: RepositorySnapshot;
  comparisonBasis: ComparisonBasis;
  analysisPlan: AnalysisPlan;
  promptDocs?: LoadedPromptDoc[];
  agentReports: Array<{
    agentId: string;
    provider: string;
    report: {
      summary: string;
      findings: unknown[];
    };
  }>;
};

export function buildPlanningPrompt({
  repository,
  documents,
  chunks,
  comparisonBasis,
  promptDocs = [],
}: PlanningPromptInput) {
  const codeSignals = summarizeCodeSignals(chunks);
  const documentChunks = documents.flatMap((document) => document.chunks);
  const documentSummary = documentChunks
    .slice(0, 30)
    .map((chunk) => {
      const heading = chunk.heading ? ` / heading: ${chunk.heading}` : "";
      return `- ${chunk.documentName} chunk ${chunk.index + 1}${heading}: ${limit(chunk.text, 700)}`;
    })
    .join("\n");

  return `
당신은 CodeMatchAA의 분석 계획 에이전트다.
목표는 업로드 기술문서와 GitHub 레포지토리의 디렉터리 구조를 비교해 후속 분석 계획을 만드는 것이다.

중요한 제약:
- 코드 본문 전체를 보고 구현 여부를 확정하지 않는다.
- 디렉터리 구조, 파일 path, endpoint 후보, 문서 요약만 사용한다.
- finding을 만들지 말고 후속 분석 에이전트가 볼 계획만 만든다.
- 모든 출력은 한국어 JSON으로 작성한다.

Mandatory stage instruction documents:
${formatPromptDocs(promptDocs)}

Repository:
- owner/repo: ${repository.owner}/${repository.repo}
- default branch: ${repository.defaultBranch}
- description: ${repository.description ?? "N/A"}
- collected files: ${repository.files.length}

Comparison basis:
${basisInstruction(comparisonBasis)}

Allowed detection types:
${allowedDetectionTypes(comparisonBasis).join(", ")}

Detected endpoint candidates:
${codeSignals.endpoints.length ? codeSignals.endpoints.join("\n") : "No endpoints detected"}

Repository file paths:
${codeSignals.files.join("\n")}

Uploaded document summaries:
${documentSummary || documents.map((document) => `- ${document.name}: ${limit(document.text, 1200)}`).join("\n")}

반드시 다음을 포함하라:
- 분석 우선순위가 높은 targetAreas
- 각 target area의 documentRequirement
- 후속 분석 에이전트가 읽어야 할 candidatePaths
- 적용할 detectionTypes
- 구조만 보고 판단한 uncertainty
`.trim();
}

export function buildAnalysisPrompt({
  repository,
  documents,
  chunks,
  comparisonBasis,
  analysisPlan,
  promptDocs = [],
  detectionDocs = [],
  agentId = "analysis-agent",
  provider,
}: PromptInput) {
  const selectedChunks = selectCodeChunksForAnalysis(chunks, analysisPlan);
  const allCodeSignals = summarizeCodeSignals(chunks);
  const selectedCodeSignals = summarizeCodeSignals(selectedChunks);
  const documentChunks = documents.flatMap((document) => document.chunks);
  const documentText = documentChunks
    .slice(0, 50)
    .map(
      (chunk) =>
        `# Document: ${chunk.documentName} [chunk ${chunk.index + 1}]${
          chunk.heading ? `\n## Section: ${chunk.heading}` : ""
        }\n${limit(chunk.text, 2_400)}`,
    )
    .join("\n\n---\n\n");
  const codeText = selectedChunks
    .map(
      (chunk) =>
        `# File: ${chunk.path}:${chunk.startLine}-${chunk.endLine} (${chunk.language})\n${limit(
          chunk.text,
          2_200,
        )}`,
    )
    .join("\n\n---\n\n");

  return `
You are CodeMatchAA's analysis agent.
Persona:
- You are a senior software maintenance reviewer who compares technical documents with real code.
- You must be evidence-first, conservative about absence, and explicit about uncertainty.
- You are one of two independent analysis agents. Do not assume the other agent's result.
Return Korean output only.

Mandatory stage instruction documents:
${formatPromptDocs(promptDocs)}

Agent:
- id: ${agentId}
- provider: ${provider ?? "unknown"}

Repository:
- owner/repo: ${repository.owner}/${repository.repo}
- default branch: ${repository.defaultBranch}
- description: ${repository.description ?? "N/A"}
- collected files: ${repository.files.length}

Comparison basis:
${basisInstruction(comparisonBasis)}

Analysis plan:
${analysisPlan ? formatAnalysisPlan(analysisPlan) : "No explicit plan was provided. Analyze the highest-signal document and code chunks."}

Mandatory detection standard documents:
${formatDetectionDocs(detectionDocs)}

Basis filtering rules:
${basisFilteringRules(comparisonBasis)}

Rules:
- Report likely issues, not absolute proof.
- Use concrete evidence from both document and code.
- Phrase absence as "수집·분석된 코드 범위에서 구현 근거를 확인하지 못했습니다" when code evidence is missing.
- Prefer high confidence only when both sides are specific.
- If evidence is weak, lower confidence instead of inventing details.
- Do not introduce requirements that are not present in the uploaded documents or code.
- If there is no meaningful mismatch, return an empty findings array with a concise summary.
- Keep recommendations practical.
- For document_latest, prioritize missing_feature and concrete api_mismatch findings with exact document evidence.
- For code_latest, return only outdated_doc findings: implemented code behavior, function, class, or endpoint that is not described in the uploaded documents. Do not report api_mismatch or missing_feature in this mode. Always include codeLocations with path and symbolName, line range, or endpoint when available.
- For unknown, identify mismatch candidates without deciding which artifact should be changed.
- If a PDF page is known from the document chunk, include documentLocation.documentName, pageNumber, and matchedText.
- For endpoint evidence, include codeLocations.endpoint.method and codeLocations.endpoint.path when known.

Detected code endpoints:
${selectedCodeSignals.endpoints.length > 0 ? selectedCodeSignals.endpoints.join("\n") : "No endpoints detected in selected chunks"}

Collected file paths:
${allCodeSignals.files.join("\n")}

Selected code chunk policy:
${formatSelectedChunkPolicy(chunks, selectedChunks, analysisPlan)}

Uploaded documents:
${documentText || documents.map((document) => `# Document: ${document.name}\n${limit(document.text, 4_000)}`).join("\n\n---\n\n")}

Repository code snippets:
${codeText}
`.trim();
}

export function buildReportWriterPrompt({
  repository,
  comparisonBasis,
  analysisPlan,
  promptDocs = [],
  agentReports,
}: ReportWriterPromptInput) {
  return `
당신은 CodeMatchAA의 문서 작성 에이전트다.
목표는 분석 계획 에이전트의 계획, 두 분석 에이전트의 결과, 선택적으로 제공되는 정적 검증 후보를 비교해 최종 사용자 리포트를 작성하는 것이다.

중요한 규칙:
- 새로운 finding을 임의로 만들지 않는다. 제공된 분석 에이전트 결과와 정적 검증 후보 안의 근거만 사용한다.
- 두 분석 에이전트가 같은 endpoint, 같은 코드 위치, 같은 문서 근거를 지적하면 합의 항목으로 우선 표시한다.
- 정적 검증 후보가 분석 에이전트 결과와 같은 문제를 지적하면 근거 보강 신호로 사용한다.
- 정적 검증 후보만 제기한 항목은 "추가 검토 필요"로 표시하고 confidence를 0.60 이하로 제한한다.
- 한쪽 분석 에이전트만 제기한 항목은 "추가 검토 필요"로 표시하고 confidence를 0.65 이하로 제한한다.
- 두 결과가 충돌하면 확정 표현을 피하고 recommendation에 충돌/확인 필요를 명시한다.
- ${comparisonBasis === "code_latest" ? "code_latest에서는 outdated_doc만 최종 finding으로 남긴다." : ""}
- ${comparisonBasis === "document_latest" ? "document_latest에서는 missing_feature와 api_mismatch만 최종 finding으로 남긴다." : ""}
- 모든 출력은 한국어 JSON으로 작성한다.

Mandatory stage instruction documents:
${formatPromptDocs(promptDocs)}

Repository:
- owner/repo: ${repository.owner}/${repository.repo}
- default branch: ${repository.defaultBranch}

Comparison basis:
${basisInstruction(comparisonBasis)}

Analysis plan:
${formatAnalysisPlan(analysisPlan)}

Report writer input sources:
${agentReports
  .map(
    (agent) => `
## ${agent.agentId} (${agent.provider})
Source type:
${agent.provider === "static_validation" ? "static validation candidates from deterministic endpoint/function signals" : "independent analysis agent result"}

Summary:
${agent.report.summary}

Findings:
${JSON.stringify(agent.report.findings, null, 2)}
`.trim(),
  )
  .join("\n\n---\n\n")}

최종 리포트의 recommendation에는 가능한 경우 "멀티 에이전트 합의" 또는 "추가 검토 필요" 문구를 포함하라.
`.trim();
}

function formatAnalysisPlan(plan: AnalysisPlan) {
  return [
    `Summary: ${plan.summary}`,
    "Target areas:",
    ...plan.targetAreas.map((area) =>
      [
        `- ${area.id} (${area.priority})`,
        `  requirement: ${area.documentRequirement}`,
        `  paths: ${area.candidatePaths.join(", ") || "N/A"}`,
        `  detectionTypes: ${area.detectionTypes.join(", ")}`,
        `  reason: ${area.reason}`,
        `  uncertainty: ${area.uncertainty}`,
      ].join("\n"),
    ),
    `Required detection docs: ${plan.requiredDetectionDocs.join(", ") || "N/A"}`,
    `Notes: ${plan.analysisNotes.join(" / ") || "N/A"}`,
  ].join("\n");
}

export function selectCodeChunksForAnalysis(chunks: CodeChunk[], analysisPlan?: AnalysisPlan): CodeChunk[] {
  if (!analysisPlan) {
    return chunks.slice(0, MAX_ANALYSIS_CODE_CHUNKS);
  }

  const selected = new Map<string, CodeChunk>();
  const candidateMatchers = buildCandidateMatchers(analysisPlan);
  for (const chunk of chunks) {
    const match = candidateMatchers.find((matcher) => matcher.matches(chunk.path));
    if (!match) continue;
    selected.set(chunkKey(chunk), chunk);
    if (selected.size >= MAX_ANALYSIS_CODE_CHUNKS) {
      return [...selected.values()];
    }
  }

  const supplement = scoreSupplementChunks(chunks, analysisPlan)
    .filter((item) => item.score > 0 && !selected.has(chunkKey(item.chunk)))
    .sort((a, b) => b.score - a.score || a.chunk.path.localeCompare(b.chunk.path));
  for (const item of supplement) {
    selected.set(chunkKey(item.chunk), item.chunk);
    if (selected.size >= MAX_ANALYSIS_CODE_CHUNKS) break;
  }

  return selected.size > 0 ? [...selected.values()] : chunks.slice(0, MAX_ANALYSIS_CODE_CHUNKS);
}

function buildCandidateMatchers(analysisPlan: AnalysisPlan) {
  const priorityRank = { high: 0, low: 1 };
  return analysisPlan.targetAreas
    .flatMap((area) =>
      area.candidatePaths.map((candidatePath, index) => ({
        candidatePath,
        priority: priorityRank[area.priority],
        index,
        matches: pathMatcher(candidatePath),
      })),
    )
    .filter((matcher) => matcher.candidatePath.trim().length > 0)
    .sort((a, b) => a.priority - b.priority || a.index - b.index);
}

function pathMatcher(candidatePath: string) {
  const normalizedCandidate = normalizePath(candidatePath);
  if (!normalizedCandidate) return () => false;

  if (normalizedCandidate.includes("*")) {
    const pattern = normalizedCandidate
      .split("**")
      .map((part) => escapeRegExp(part).replace(/\\\*/g, "[^/]*"))
      .join(".*");
    const regex = new RegExp(`^${pattern}$`);
    return (chunkPath: string) => regex.test(normalizePath(chunkPath));
  }

  const directoryPrefix = normalizedCandidate.endsWith("/")
    ? normalizedCandidate
    : looksLikeDirectoryPath(normalizedCandidate)
      ? `${normalizedCandidate}/`
      : null;

  return (chunkPath: string) => {
    const normalizedChunkPath = normalizePath(chunkPath);
    return (
      normalizedChunkPath === normalizedCandidate ||
      Boolean(directoryPrefix && normalizedChunkPath.startsWith(directoryPrefix))
    );
  };
}

function scoreSupplementChunks(chunks: CodeChunk[], analysisPlan: AnalysisPlan) {
  const weightedTerms = analysisPlan.targetAreas.flatMap((area) => {
    const weight = area.priority === "high" ? 3 : 1;
    return tokenize(`${area.documentRequirement} ${area.reason}`).map((term) => ({ term, weight }));
  });

  return chunks.map((chunk) => {
    const path = normalizePath(chunk.path);
    const text = chunk.text.toLowerCase();
    const score = weightedTerms.reduce((sum, { term, weight }) => {
      const pathHit = path.includes(term) ? weight * 3 : 0;
      const textHit = text.includes(term) ? weight : 0;
      return sum + pathHit + textHit;
    }, 0);
    return { chunk, score };
  });
}

function formatSelectedChunkPolicy(chunks: CodeChunk[], selectedChunks: CodeChunk[], analysisPlan?: AnalysisPlan) {
  if (!analysisPlan) {
    return `No analysis plan was provided. Using the first ${selectedChunks.length} of ${chunks.length} chunks.`;
  }

  const candidatePaths = unique(analysisPlan.targetAreas.flatMap((area) => area.candidatePaths));
  const selectedPaths = unique(selectedChunks.map((chunk) => chunk.path));
  return [
    `Analysis plan candidatePaths were used as the primary code selection source.`,
    `Selected chunks: ${selectedChunks.length} of ${chunks.length}.`,
    `Candidate paths: ${candidatePaths.join(", ") || "N/A"}.`,
    `Selected files: ${selectedPaths.join(", ") || "N/A"}.`,
    `If a candidate path did not match a collected file, keyword-ranked supplement chunks were used before any fallback.`,
  ].join("\n");
}

function chunkKey(chunk: CodeChunk) {
  return `${chunk.path}:${chunk.startLine}:${chunk.endLine}`;
}

function normalizePath(value: string) {
  return value.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/").toLowerCase();
}

function looksLikeDirectoryPath(value: string) {
  const lastSegment = value.split("/").at(-1) ?? value;
  return !lastSegment.includes(".");
}

function tokenize(value: string) {
  return unique(
    value
      .toLowerCase()
      .split(/[^a-z0-9가-힣]+/i)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3),
  ).slice(0, 40);
}

function escapeRegExp(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.*]/g, "\\$&");
}

function formatPromptDocs(promptDocs: LoadedPromptDoc[]) {
  if (!promptDocs.length) {
    return "No stage instruction document was loaded. Runtime provider calls must load the required multi-agent-docs files before building this prompt.";
  }

  return promptDocs
    .map(
      (document) => `
## ${document.relativePath}

${document.content}
`.trim(),
    )
    .join("\n\n---\n\n");
}

function formatDetectionDocs(detectionDocs: LoadedDetectionDoc[]) {
  if (!detectionDocs.length) {
    return "No detection standard document was loaded. Return an empty findings array unless the selected detection options explicitly allow a type.";
  }

  return detectionDocs
    .map(
      (document) => `
## ${document.type}
Source: ${document.relativePath}

${document.content}
`.trim(),
    )
    .join("\n\n---\n\n");
}

function basisFilteringRules(comparisonBasis: ComparisonBasis) {
  if (comparisonBasis === "document_latest") {
    return [
      "- Uploaded documents are the latest baseline.",
      "- Use only missing_feature and api_mismatch findings.",
      "- Do not report outdated_doc in this mode.",
    ].join("\n");
  }
  if (comparisonBasis === "code_latest") {
    return [
      "- GitHub code is the latest baseline.",
      "- Use only outdated_doc findings.",
      "- Do not report missing_feature or api_mismatch in this mode.",
    ].join("\n");
  }
  return [
    "- It is unknown which side is newer.",
    "- Use loaded detection standard documents as mismatch-candidate definitions.",
    "- Do not decide whether document or code should be changed.",
  ].join("\n");
}

function allowedDetectionTypes(comparisonBasis: ComparisonBasis) {
  if (comparisonBasis === "document_latest") return ["missing_feature", "api_mismatch"];
  if (comparisonBasis === "code_latest") return ["outdated_doc"];
  return ["missing_feature", "api_mismatch", "outdated_doc"];
}

function basisInstruction(comparisonBasis: ComparisonBasis) {
  if (comparisonBasis === "document_latest") {
    return [
      "- Uploaded documents are the latest baseline.",
      "- Find requirements described in documents but not confirmed in collected code.",
      "- User-facing meaning: 최신 문서에 정의된 요구사항이 현재 코드에 반영되지 않았을 가능성이 있습니다.",
    ].join("\n");
  }
  if (comparisonBasis === "code_latest") {
    return [
      "- GitHub code is the latest baseline.",
      "- Find implemented behavior in code that uploaded documents do not describe.",
      "- User-facing meaning: 현재 코드에 구현된 기능이 업로드 문서에 반영되지 않았을 가능성이 있습니다.",
    ].join("\n");
  }
  return [
    "- It is unknown which side is newer.",
    "- Detect mismatch candidates only and do not decide whether document or code should be changed.",
    "- User-facing meaning: 문서와 코드 간 불일치 후보가 발견되었습니다.",
  ].join("\n");
}

function limit(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}\n...[truncated]` : value;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
