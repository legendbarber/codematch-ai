import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readArtifactBuffer, saveArtifactBuffer, sanitizeFileName } from "@/server/artifact-storage";

let tempDir: string | null = null;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
  delete process.env.LOCAL_ARTIFACT_DIR;
  delete process.env.ARTIFACT_STORAGE_DRIVER;
});

describe("artifact storage", () => {
  it("stores and reads local artifact buffers", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "codematch-artifacts-"));
    process.env.LOCAL_ARTIFACT_DIR = tempDir;
    process.env.ARTIFACT_STORAGE_DRIVER = "local";

    const stored = await saveArtifactBuffer("source.pdf", Buffer.from("pdf"));
    const buffer = await readArtifactBuffer(stored.storageKey);

    expect(buffer.toString("utf8")).toBe("pdf");
    expect(stored.size).toBe(3);
  });

  it("sanitizes user-controlled file names", () => {
    expect(sanitizeFileName("../../bad name?.pdf")).toBe("bad-name-.pdf");
  });
});
