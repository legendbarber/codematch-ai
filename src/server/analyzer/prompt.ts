import { summarizeCodeSignals } from "../chunker";
import type { CodeChunk, ParsedDocument, RepositorySnapshot } from "../types";

type PromptInput = {
  repository: RepositorySnapshot;
  documents: ParsedDocument[];
  chunks: CodeChunk[];
};

export function buildAnalysisPrompt({ repository, documents, chunks }: PromptInput) {
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

Detection types:
- missing_feature: a document promises a feature, flow, or behavior that the code does not appear to implement.
- api_mismatch: documented API path, method, request, response, or field differs from implementation.
- outdated_doc: code appears to implement behavior that the document omits or describes as older behavior.

Rules:
- Report likely issues, not absolute proof.
- Use concrete evidence from both document and code.
- Prefer high confidence only when both sides are specific.
- If there is no meaningful mismatch, return an empty findings array with a concise summary.
- Keep recommendations practical.

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

function limit(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}\n...[truncated]` : value;
}
