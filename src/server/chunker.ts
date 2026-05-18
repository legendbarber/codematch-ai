import type { CodeChunk, SourceFile } from "./types";

const MAX_LINES_PER_CHUNK = 90;
const OVERLAP_LINES = 12;

export function chunkSourceFiles(files: SourceFile[]): CodeChunk[] {
  const chunks: CodeChunk[] = [];

  for (const file of files) {
    const lines = file.text.split(/\r?\n/);
    if (lines.length <= MAX_LINES_PER_CHUNK) {
      chunks.push({
        path: file.path,
        language: file.language,
        startLine: 1,
        endLine: lines.length,
        text: file.text.trim(),
      });
      continue;
    }

    for (let index = 0; index < lines.length; index += MAX_LINES_PER_CHUNK - OVERLAP_LINES) {
      const slice = lines.slice(index, index + MAX_LINES_PER_CHUNK);
      chunks.push({
        path: file.path,
        language: file.language,
        startLine: index + 1,
        endLine: index + slice.length,
        text: slice.join("\n").trim(),
      });
    }
  }

  return chunks.filter((chunk) => chunk.text.length > 0).slice(0, 140);
}

export function extractEndpointSignals(text: string): string[] {
  const patterns = [
    /\b(?:GET|POST|PUT|PATCH|DELETE)\s+([/][\w\-/:{}.[\]]+)/gi,
    /\.(?:get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/gi,
    /router\.(?:get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/gi,
    /@(?:Get|Post|Put|Patch|Delete)(?:Mapping)?\(\s*["'`]([^"'`]+)["'`]/g,
  ];

  const endpoints = new Set<string>();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      endpoints.add(match[1]);
    }
  }
  return [...endpoints].sort();
}

export function summarizeCodeSignals(chunks: CodeChunk[]) {
  const endpoints = new Set<string>();
  const files = new Set<string>();

  for (const chunk of chunks) {
    files.add(chunk.path);
    for (const endpoint of extractEndpointSignals(chunk.text)) {
      endpoints.add(endpoint);
    }
  }

  return {
    endpoints: [...endpoints].slice(0, 80),
    files: [...files].slice(0, 120),
  };
}
