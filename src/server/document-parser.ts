import path from "node:path";
import type { ParsedDocument, UploadedDocumentInput } from "./types";

const MAX_DOCUMENT_CHARS = 80_000;

export async function parseUploadedDocument(
  document: UploadedDocumentInput,
): Promise<ParsedDocument> {
  const extension = path.extname(document.name).toLowerCase();
  const mimeType = document.mimeType || "application/octet-stream";
  let text = "";

  if (extension === ".pdf" || mimeType === "application/pdf") {
    text = await parsePdf(document.buffer);
  } else if (isTextDocument(extension, mimeType)) {
    text = document.buffer.toString("utf8");
  } else {
    throw new Error(`${document.name}: 지원하지 않는 문서 형식입니다.`);
  }

  const normalized = normalizeText(text).slice(0, MAX_DOCUMENT_CHARS);
  if (normalized.length < 20) {
    throw new Error(`${document.name}: 분석 가능한 텍스트를 찾지 못했습니다.`);
  }

  return {
    name: document.name,
    mimeType,
    size: document.size,
    text: normalized,
  };
}

export async function parseUploadedDocuments(
  documents: UploadedDocumentInput[],
): Promise<ParsedDocument[]> {
  return Promise.all(documents.map((document) => parseUploadedDocument(document)));
}

function isTextDocument(extension: string, mimeType: string) {
  return (
    [".md", ".markdown", ".txt", ".json", ".yaml", ".yml"].includes(extension) ||
    mimeType.startsWith("text/") ||
    mimeType.includes("markdown") ||
    mimeType.includes("json")
  );
}

async function parsePdf(buffer: Buffer) {
  const pdfModule = (await import("pdf-parse")) as unknown as {
    default?: (input: Buffer) => Promise<{ text: string }>;
  } & ((input: Buffer) => Promise<{ text: string }>);
  const parser = pdfModule.default ?? pdfModule;
  const result = await parser(buffer);
  return result.text;
}

function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]{2,}/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}
