import { describe, expect, it } from "vitest";
import { parseGithubRepoUrl } from "../src/server/github";

describe("parseGithubRepoUrl", () => {
  it("parses normal github urls", () => {
    expect(parseGithubRepoUrl("https://github.com/vercel/next.js")).toEqual({
      owner: "vercel",
      repo: "next.js",
    });
  });

  it("parses ssh-style urls", () => {
    expect(parseGithubRepoUrl("git@github.com:openai/openai-node.git")).toEqual({
      owner: "openai",
      repo: "openai-node",
    });
  });

  it("rejects non-github urls", () => {
    expect(() => parseGithubRepoUrl("https://gitlab.com/acme/project")).toThrow(/GitHub/);
  });
});
