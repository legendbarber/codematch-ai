import { summarizeCodeSignals } from "../chunker";
import type { CodeChunk, ComparisonBasis, ParsedDocument, RepositorySnapshot } from "../types";

type PromptInput = {
  repository: RepositorySnapshot;
  documents: ParsedDocument[];
  chunks: CodeChunk[];
  comparisonBasis: ComparisonBasis;
};

export function buildAnalysisPrompt({ repository, documents, chunks, comparisonBasis }: PromptInput) {
  const codeSignals = summarizeCodeSignals(chunks);
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
  const codeText = chunks
    .slice(0, 70)
    .map(
      (chunk) =>
        `# File: ${chunk.path}:${chunk.startLine}-${chunk.endLine} (${chunk.language})\n${limit(
          chunk.text,
          2_200,
        )}`,
    )
    .join("\n\n---\n\n");

  return `
You are CodeMatch AI, a senior software maintenance reviewer.
Compare uploaded development documents against collected public GitHub repository code.
Return Korean output only.

Repository:
- owner/repo: ${repository.owner}/${repository.repo}
- default branch: ${repository.defaultBranch}
- description: ${repository.description ?? "N/A"}
- collected files: ${repository.files.length}

Comparison basis:
${basisInstruction(comparisonBasis)}

Detection types:
- missing_feature: a document promises a feature, flow, or behavior that the code does not appear to implement.
- api_mismatch: documented API path, method, request, response, or field differs from implementation.
- outdated_doc: code appears to implement behavior that the document omits or describes as older behavior.

Rules:
- Report likely issues, not absolute proof.
- Use concrete evidence from both document and code.
- Phrase absence as "수집·분석된 코드 범위에서 구현 근거를 확인하지 못했습니다" when code evidence is missing.
- Prefer high confidence only when both sides are specific.
- If there is no meaningful mismatch, return an empty findings array with a concise summary.
- Keep recommendations practical.
- For document_latest, prioritize missing_feature and concrete api_mismatch findings with exact document evidence.
- For code_latest, return only outdated_doc findings: implemented code behavior, function, class, or endpoint that is not described in the uploaded documents. Do not report api_mismatch or missing_feature in this mode. Always include codeLocations with path and symbolName, line range, or endpoint when available.
- For unknown, identify mismatch candidates without deciding which artifact should be changed.
- If a PDF page is known from the document chunk, include documentLocation.documentName, pageNumber, and matchedText.
- For endpoint evidence, include codeLocations.endpoint.method and codeLocations.endpoint.path when known.

Detected code endpoints:
${codeSignals.endpoints.length > 0 ? codeSignals.endpoints.join("\n") : "No endpoints detected"}

Collected file paths:
${codeSignals.files.join("\n")}

Uploaded documents:
${documentText || documents.map((document) => `# Document: ${document.name}\n${limit(document.text, 4_000)}`).join("\n\n---\n\n")}

Repository code snippets:
${codeText}
`.trim();
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
