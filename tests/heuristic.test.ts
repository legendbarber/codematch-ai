import { describe, expect, it } from "vitest";
import { heuristicAnalyze } from "../src/server/analyzer/heuristic";

describe("heuristicAnalyze", () => {
  it("detects documented endpoint missing from code", () => {
    const report = heuristicAnalyze({
      repository: {
        owner: "acme",
        repo: "demo",
        defaultBranch: "main",
        description: null,
        htmlUrl: "https://github.com/acme/demo",
        files: [
          {
            path: "src/routes.ts",
            language: "TypeScript",
            text: "router.get('/health', handler)",
          },
        ],
        warnings: [],
      },
      documents: [
        {
          name: "README.md",
          mimeType: "text/markdown",
          size: 100,
          text: "API\nGET /users\n로그인 기능을 제공한다.",
          chunks: [
            {
              documentName: "README.md",
              index: 0,
              heading: "API",
              text: "API\nGET /users\n로그인 기능을 제공한다.",
            },
          ],
        },
      ],
      chunks: [
        {
          path: "src/routes.ts",
          language: "TypeScript",
          startLine: 1,
          endLine: 1,
          text: "router.get('/health', handler)",
        },
      ],
      options: {
        missingFeature: true,
        apiMismatch: true,
        outdatedDoc: true,
      },
    });

    expect(report.findings.some((finding) => finding.type === "api_mismatch")).toBe(true);
    expect(report.findings.some((finding) => finding.type === "missing_feature")).toBe(true);
  });
});
