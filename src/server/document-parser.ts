import path from "node:path";
import type {
  DocumentChunk,
  ParsedDocument,
  ParsedDocumentPage,
  PdfTextItem,
  UploadedDocumentInput,
} from "./types";

const MAX_DOCUMENT_CHARS = 80_000;
const MAX_CHUNK_CHARS = 2_400;
const CHUNK_OVERLAP_CHARS = 280;

export async function parseUploadedDocument(
  document: UploadedDocumentInput,
): Promise<ParsedDocument> {
  const extension = path.extname(document.name).toLowerCase();
  const mimeType = document.mimeType || "application/octet-stream";
  let text = "";

  if (extension === ".pdf" || mimeType === "application/pdf") {
    const pdf = await parsePdf(document.buffer);
    text = pdf.text;
    const normalized = normalizeText(text).slice(0, MAX_DOCUMENT_CHARS);
    if (normalized.length < 20) {
      throw new Error(`${document.name}: 분석 가능한 텍스트를 찾지 못했습니다.`);
    }

    return {
      name: document.name,
      mimeType,
      size: document.size,
      text: normalized,
      chunks: chunkPdfDocument(document.name, pdf.pages),
      pages: pdf.pages,
      pdfTextItems: pdf.items,
    };
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
    chunks: chunkDocument(document.name, normalized),
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

async function parsePdf(buffer: Buffer): Promise<{
  text: string;
  pages: ParsedDocumentPage[];
  items: PdfTextItem[];
}> {
  const { PDFParse } = (await import("pdf-parse")) as typeof import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const [result, items] = await Promise.all([parser.getText({ pageJoiner: "\n" }), extractPdfTextItems(buffer)]);
    const pages = result.pages.map((page) => ({
      pageNumber: page.num,
      text: normalizeText(page.text),
    }));
    return {
      text: result.text,
      pages,
      items,
    };
  } finally {
    await parser.destroy();
  }
}

async function extractPdfTextItems(buffer: Buffer): Promise<PdfTextItem[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
  });
  const pdf = await task.promise;
  const items: PdfTextItem[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      for (const item of textContent.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const transform = item.transform as number[];
        items.push({
          pageNumber,
          text: item.str,
          x: transform[4],
          y: transform[5],
          width: item.width,
          height: item.height || Math.abs(transform[3]) || 10,
        });
      }
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return items;
}

function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\u0000/g, "")
    .replace(/[ \u00a0]{2,}/g, " ")
    .replace(/[ \u00a0]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function chunkDocument(documentName: string, text: string): DocumentChunk[] {
  const sections = splitIntoSections(text);
  const chunks: DocumentChunk[] = [];

  for (const section of sections) {
    const paragraphs = section.text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
    let current = "";

    for (const paragraph of paragraphs.length ? paragraphs : [section.text]) {
      if (current && current.length + paragraph.length + 2 > MAX_CHUNK_CHARS) {
        chunks.push(createChunk(documentName, chunks.length, section.heading, current));
        current = overlapTail(current);
      }
      current = current ? `${current}\n\n${paragraph}` : paragraph;

      while (current.length > MAX_CHUNK_CHARS) {
        chunks.push(createChunk(documentName, chunks.length, section.heading, current.slice(0, MAX_CHUNK_CHARS)));
        current = overlapTail(current);
      }
    }

    if (current.trim()) {
      chunks.push(createChunk(documentName, chunks.length, section.heading, current));
    }
  }

  return chunks.filter((chunk) => chunk.text.length > 0).slice(0, 80);
}

function chunkPdfDocument(documentName: string, pages: ParsedDocumentPage[]): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  for (const page of pages) {
    for (const chunk of chunkDocument(documentName, page.text)) {
      chunks.push({
        ...chunk,
        index: chunks.length,
        pageNumber: page.pageNumber,
      });
    }
  }
  return chunks.slice(0, 80);
}

function splitIntoSections(text: string) {
  const sections: Array<{ heading: string | null; text: string }> = [];
  let heading: string | null = null;
  let lines: string[] = [];

  for (const line of text.split("\n")) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$|^([0-9]+(?:\.[0-9]+)*)\s+(.+)$/);
    if (headingMatch && lines.some((value) => value.trim())) {
      sections.push({ heading, text: lines.join("\n").trim() });
      lines = [];
    }
    if (headingMatch) {
      heading = (headingMatch[2] ?? headingMatch[4]).trim();
    }
    lines.push(line);
  }

  if (lines.some((value) => value.trim())) {
    sections.push({ heading, text: lines.join("\n").trim() });
  }

  return sections.length ? sections : [{ heading: null, text }];
}

function createChunk(
  documentName: string,
  index: number,
  heading: string | null,
  text: string,
): DocumentChunk {
  return {
    documentName,
    index,
    heading,
    text: text.trim(),
  };
}

function overlapTail(text: string) {
  if (text.length <= CHUNK_OVERLAP_CHARS) return text;
  return text.slice(-CHUNK_OVERLAP_CHARS).replace(/^\S+\s*/, "").trim();
}
