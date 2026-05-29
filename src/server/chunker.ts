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

export function extractEndpointSignals(text: string, filePath?: string): string[] {
  const patterns = [
    /\b(?:GET|POST|PUT|PATCH|DELETE)\s+([/][\w\-/:{}.[\]]+)/gi,
    /\.(?:get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/gi,
    /router\.(?:get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/gi,
    /@(?:Get|Post|Put|Patch|Delete)(?:Mapping)?\(\s*["'`]([^"'`]+)["'`]/g,
  ];

  const endpoints = new Set<string>();
  for (const endpoint of extractNextAppRouteEndpoints(text, filePath)) {
    endpoints.add(endpoint);
  }
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      endpoints.add(match[1]);
    }
  }
  return [...endpoints].sort();
}

export function extractEndpointLocations(text: string, filePath?: string) {
  const locations = new Map<string, { path: string; endpoint?: { method: string; path: string } }>();
  const add = (method: string | undefined, endpointPath: string) => {
    const normalizedMethod = method?.toUpperCase();
    const key = `${normalizedMethod ?? "UNKNOWN"}:${endpointPath}`;
    locations.set(key, {
      path: filePath ?? "unknown",
      endpoint: normalizedMethod ? { method: normalizedMethod, path: endpointPath } : undefined,
    });
  };

  for (const endpoint of extractNextAppRouteEndpoints(text, filePath)) {
    const match = endpoint.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/i);
    if (match) add(match[1], match[2]);
  }

  const methodPathPattern = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+([/][\w\-/:{}.[\]]+)/gi;
  for (const match of text.matchAll(methodPathPattern)) {
    add(match[1], match[2]);
  }

  const expressPattern = /\.(get|post|put|patch|delete|head|options)\(\s*["'`]([^"'`]+)["'`]/gi;
  for (const match of text.matchAll(expressPattern)) {
    add(match[1], match[2]);
  }

  const routerPattern = /router\.(get|post|put|patch|delete|head|options)\(\s*["'`]([^"'`]+)["'`]/gi;
  for (const match of text.matchAll(routerPattern)) {
    add(match[1], match[2]);
  }

  const decoratorPattern = /@(Get|Post|Put|Patch|Delete)(?:Mapping)?\(\s*["'`]([^"'`]+)["'`]/g;
  for (const match of text.matchAll(decoratorPattern)) {
    add(match[1], match[2]);
  }

  return [...locations.values()];
}

function extractNextAppRouteEndpoints(text: string, filePath?: string) {
  const routePath = nextAppRoutePath(filePath);
  if (!routePath) return [];
  const methods = new Set<string>();
  const methodPattern =
    /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(|export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=/g;
  for (const match of text.matchAll(methodPattern)) {
    methods.add((match[1] ?? match[2]).toUpperCase());
  }
  return [...methods].map((method) => `${method} ${routePath}`);
}

function nextAppRoutePath(filePath?: string) {
  if (!filePath) return null;
  const normalized = filePath.replace(/\\/g, "/");
  const match = normalized.match(/(?:^|\/)(?:src\/)?app\/api\/(.+)\/route\.(?:ts|tsx|js|jsx)$/);
  if (!match) return null;
  const route = match[1]
    .split("/")
    .map((segment) => {
      const catchAll = segment.match(/^\[\.\.\.(.+)]$/);
      if (catchAll) return `:${catchAll[1]}*`;
      const optionalCatchAll = segment.match(/^\[\[\.\.\.(.+)]]$/);
      if (optionalCatchAll) return `:${optionalCatchAll[1]}*`;
      const dynamic = segment.match(/^\[(.+)]$/);
      if (dynamic) return `:${dynamic[1]}`;
      return segment;
    })
    .join("/");
  return `/api/${route}`.replace(/\/+/g, "/");
}

export function summarizeCodeSignals(chunks: CodeChunk[]) {
  const endpoints = new Set<string>();
  const files = new Set<string>();

  for (const chunk of chunks) {
    files.add(chunk.path);
    for (const endpoint of extractEndpointSignals(chunk.text, chunk.path)) {
      endpoints.add(endpoint);
    }
  }

  return {
    endpoints: [...endpoints].slice(0, 80),
    files: [...files].slice(0, 120),
  };
}
