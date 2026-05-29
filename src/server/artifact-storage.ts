import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type StoredArtifact = {
  storageKey: string;
  size: number;
};

export function artifactStorageEnabled() {
  return storageDriver() === "local";
}

export function artifactRetentionDays() {
  const value = Number(process.env.ARTIFACT_RETENTION_DAYS ?? "1");
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function artifactExpiresAt() {
  return new Date(Date.now() + artifactRetentionDays() * 24 * 60 * 60 * 1000);
}

export async function saveArtifactBuffer(fileName: string, buffer: Buffer): Promise<StoredArtifact> {
  if (!artifactStorageEnabled()) {
    throw new Error("현재 서버 설정에서 artifact 저장소가 비활성화되어 있습니다.");
  }

  const storageKey = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${sanitizeFileName(fileName)}`;
  const fullPath = localArtifactPath(storageKey);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer);
  return {
    storageKey,
    size: buffer.length,
  };
}

export async function readArtifactBuffer(storageKey: string) {
  if (!artifactStorageEnabled()) {
    throw new Error("현재 서버 설정에서 artifact 다운로드가 비활성화되어 있습니다.");
  }
  return fs.readFile(localArtifactPath(storageKey));
}

export function sanitizeFileName(value: string) {
  return path
    .basename(value.replace(/\\/g, "/"))
    .normalize("NFKD")
    .replace(/[^\w.\-가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "codematch-artifact";
}

function storageDriver() {
  const configured = process.env.ARTIFACT_STORAGE_DRIVER;
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? "disabled" : "local";
}

function localArtifactPath(storageKey: string) {
  const root =
    process.env.LOCAL_ARTIFACT_DIR ||
    path.join(/*turbopackIgnore: true*/ process.cwd(), "var", "artifacts");
  const normalizedKey = storageKey.replace(/\\/g, "/").replace(/\.\./g, "");
  return path.join(root, normalizedKey);
}
