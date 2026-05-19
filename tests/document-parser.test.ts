import { describe, expect, it } from "vitest";
import { chunkDocument, parseUploadedDocument } from "../src/server/document-parser";

describe("parseUploadedDocument", () => {
  it("normalizes text files and creates document chunks", async () => {
    const parsed = await parseUploadedDocument({
      name: "requirements.md",
      mimeType: "text/markdown",
      size: 74,
      buffer: Buffer.from("# API\n\nGET /users\r\n\r\n회원 목록을 반환한다.", "utf8"),
    });

    expect(parsed.text).toContain("GET /users");
    expect(parsed.chunks).toHaveLength(1);
    expect(parsed.chunks[0]).toMatchObject({
      documentName: "requirements.md",
      heading: "API",
    });
  });

  it("rejects unsupported document formats", async () => {
    await expect(
      parseUploadedDocument({
        name: "diagram.png",
        mimeType: "image/png",
        size: 10,
        buffer: Buffer.from("not text", "utf8"),
      }),
    ).rejects.toThrow(/지원하지 않는 문서 형식/);
  });
});

describe("chunkDocument", () => {
  it("splits long documents into bounded overlapping chunks", () => {
    const text = `# Overview\n\n${Array.from({ length: 120 }, (_, index) => `문단 ${index} ${"내용 ".repeat(20)}`).join(
      "\n\n",
    )}`;
    const chunks = chunkDocument("plan.md", text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 2_400)).toBe(true);
    expect(chunks[0].heading).toBe("Overview");
  });
});
