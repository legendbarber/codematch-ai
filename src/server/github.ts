import { z } from "zod";
import type { RepositorySnapshot, SourceFile } from "./types";

const repoResponseSchema = z.object({
  name: z.string(),
  full_name: z.string(),
  default_branch: z.string(),
  description: z.string().nullable(),
  html_url: z.string(),
  private: z.boolean(),
  owner: z.object({
    login: z.string(),
  }),
});

const treeResponseSchema = z.object({
  tree: z.array(
    z.object({
      path: z.string(),
      type: z.string(),
      sha: z.string().optional(),
      size: z.number().optional(),
    }),
  ),
  truncated: z.boolean().optional(),
});

const CODE_EXTENSIONS = new Map<string, string>([
  [".ts", "TypeScript"],
  [".tsx", "TypeScript React"],
  [".js", "JavaScript"],
  [".jsx", "JavaScript React"],
  [".mjs", "JavaScript"],
  [".cjs", "JavaScript"],
  [".py", "Python"],
  [".java", "Java"],
  [".kt", "Kotlin"],
  [".go", "Go"],
  [".rs", "Rust"],
  [".rb", "Ruby"],
  [".php", "PHP"],
  [".cs", "C#"],
  [".swift", "Swift"],
  [".sql", "SQL"],
  [".json", "JSON"],
  [".yaml", "YAML"],
  [".yml", "YAML"],
  [".md", "Markdown"],
  [".mdx", "MDX"],
  [".toml", "TOML"],
]);

const EXCLUDED_PATH_PARTS = new Set([
  ".git",
  ".next",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
]);

export type ParsedGithubUrl = {
  owner: string;
  repo: string;
};

export function parseGithubRepoUrl(input: string): ParsedGithubUrl {
  const trimmed = input.trim();
  const normalized = trimmed
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");
  const url = new URL(normalized);

  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
    throw new Error("GitHub 공개 저장소 URL만 지원합니다.");
  }

  const [owner, repo] = url.pathname.split("/").filter(Boolean);
  if (!owner || !repo) {
    throw new Error("GitHub URL에서 owner/repository를 찾을 수 없습니다.");
  }

  return { owner, repo: repo.replace(/\.git$/, "") };
}

export async function collectRepository(repoUrl: string): Promise<RepositorySnapshot> {
  const { owner, repo } = parseGithubRepoUrl(repoUrl);
  const repoMeta = await githubJson(
    `https://api.github.com/repos/${owner}/${repo}`,
    repoResponseSchema,
  );

  if (repoMeta.private) {
    throw new Error("비공개 저장소는 이번 베타 범위에서 제외됩니다.");
  }

  const branch = repoMeta.default_branch;
  const tree = await githubJson(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(
      branch,
    )}?recursive=1`,
    treeResponseSchema,
  );

  const candidates = tree.tree
    .filter((item) => item.type === "blob")
    .filter((item) => isUsefulPath(item.path))
    .filter((item) => !item.size || item.size <= 180_000)
    .sort((a, b) => scorePath(b.path) - scorePath(a.path))
    .slice(0, 70);

  const files: SourceFile[] = [];
  const warnings: string[] = [];

  if (tree.truncated) {
    warnings.push("GitHub tree 응답이 일부 잘렸습니다. 핵심 파일 위주로 분석했습니다.");
  }

  const fetchedFiles = await mapWithConcurrency(candidates, 8, async (item) => {
    try {
      const text = await fetchRawFile(owner, repo, branch, item.path);
      if (text.trim().length < 20) return null;
      return {
        path: item.path,
        language: languageForPath(item.path),
        text,
      } satisfies SourceFile;
    } catch (error) {
      warnings.push(`${item.path} 파일 수집 실패: ${errorMessage(error)}`);
      return null;
    }
  });

  files.push(...fetchedFiles.filter((file): file is SourceFile => Boolean(file)));

  if (files.length === 0) {
    throw new Error("분석할 수 있는 코드 또는 문서 파일을 찾지 못했습니다.");
  }

  return {
    owner: repoMeta.owner.login,
    repo: repoMeta.name,
    defaultBranch: branch,
    description: repoMeta.description,
    htmlUrl: repoMeta.html_url,
    files,
    warnings,
  };
}

async function githubJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(url, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("저장소를 찾을 수 없거나 공개 저장소가 아닙니다.");
    }
    throw new Error(`GitHub API 요청 실패 (${response.status})`);
  }

  return schema.parse(await response.json());
}

async function fetchRawFile(owner: string, repo: string, branch: string, path: string) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(
    `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(
      branch,
    )}/${encodedPath}`,
    {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (!response.ok) {
    throw new Error(`raw 파일 요청 실패 (${response.status})`);
  }

  const text = await response.text();
  if (text.length > 220_000) {
    throw new Error("파일이 너무 커서 건너뜀");
  }
  return text;
}

function githubHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "codematch-ai-beta",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

function isUsefulPath(path: string) {
  const parts = path.split("/");
  if (parts.some((part) => EXCLUDED_PATH_PARTS.has(part))) return false;
  if (path.endsWith(".lock") || path.endsWith(".min.js")) return false;
  return CODE_EXTENSIONS.has(extensionOf(path));
}

function scorePath(path: string) {
  const lower = path.toLowerCase();
  let score = 0;
  if (lower.includes("readme")) score += 30;
  if (lower.includes("api") || lower.includes("route") || lower.includes("controller")) score += 25;
  if (lower.includes("auth") || lower.includes("user")) score += 16;
  if (lower.startsWith("src/") || lower.startsWith("app/")) score += 14;
  if (lower.includes("test") || lower.includes("spec")) score -= 8;
  return score;
}

function languageForPath(path: string) {
  return CODE_EXTENSIONS.get(extensionOf(path)) ?? "Text";
}

function extensionOf(path: string) {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot).toLowerCase();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
