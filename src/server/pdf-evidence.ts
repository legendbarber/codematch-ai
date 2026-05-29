import { PDFDocument, rgb } from "pdf-lib";
import type { DocumentEvidenceLocation, ParsedDocument, PdfTextItem, ReportFinding } from "./types";

const HIGHLIGHT_COLOR = rgb(1, 0.92, 0.12);

export function locateFindingInPdf(
  finding: ReportFinding,
  documents: ParsedDocument[],
): DocumentEvidenceLocation | null {
  const candidates = evidenceCandidates(finding);
  for (const document of documents) {
    if (!document.pdfTextItems?.length || !document.pages?.length) continue;
    for (const candidate of candidates) {
      const location = locateCandidate(document, candidate);
      if (location) return location;
    }
  }
  return null;
}

export async function createHighlightedPdf(
  buffer: Buffer,
  location: DocumentEvidenceLocation | DocumentEvidenceLocation[],
) {
  const locations = Array.isArray(location) ? location : [location];
  const drawableLocations = locations.filter((value) => value.pageNumber && value.boundingBoxes?.length);
  if (!drawableLocations.length) {
    throw new Error("PDF 하이라이트 좌표가 없습니다.");
  }

  const pdf = await PDFDocument.load(buffer);
  for (const drawableLocation of drawableLocations) {
    const page = pdf.getPage(drawableLocation.pageNumber! - 1);
    for (const box of drawableLocation.boundingBoxes!) {
      page.drawRectangle({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        color: HIGHLIGHT_COLOR,
        opacity: 0.35,
        borderOpacity: 0,
      });
    }
  }
  return Buffer.from(await pdf.save());
}

function locateCandidate(document: ParsedDocument, candidate: string): DocumentEvidenceLocation | null {
  const normalizedCandidate = normalizeForMatch(candidate);
  if (normalizedCandidate.length < 8) return null;

  for (const page of document.pages ?? []) {
    if (!normalizeForMatch(page.text).includes(normalizedCandidate)) continue;
    const items = document.pdfTextItems?.filter((item) => item.pageNumber === page.pageNumber) ?? [];
    const boxes = locateBoxes(items, normalizedCandidate);
    if (!boxes.length) {
      return {
        documentName: document.name,
        pageNumber: page.pageNumber,
        matchedText: candidate,
      };
    }
    return {
      documentName: document.name,
      pageNumber: page.pageNumber,
      matchedText: candidate,
      boundingBoxes: boxes,
    };
  }
  return null;
}

function locateBoxes(items: PdfTextItem[], normalizedCandidate: string) {
  const indexed: Array<PdfTextItem & { start: number; end: number }> = [];
  let cursor = 0;
  for (const item of items) {
    const text = normalizeForMatch(item.text);
    if (!text) continue;
    const start = cursor;
    cursor += text.length;
    indexed.push({ ...item, start, end: cursor });
  }

  const pageText = indexed.map((item) => normalizeForMatch(item.text)).join("");
  const matchStart = pageText.indexOf(normalizedCandidate);
  if (matchStart === -1) return [];
  const matchEnd = matchStart + normalizedCandidate.length;
  const matchedItems = indexed.filter((item) => item.end > matchStart && item.start < matchEnd);
  return mergeLineBoxes(matchedItems).slice(0, 20);
}

function mergeLineBoxes(items: PdfTextItem[]) {
  const lines = new Map<number, PdfTextItem[]>();
  for (const item of items) {
    const key = Math.round(item.y / 3) * 3;
    lines.set(key, [...(lines.get(key) ?? []), item]);
  }

  return [...lines.values()].map((lineItems) => {
    const minX = Math.min(...lineItems.map((item) => item.x));
    const minY = Math.min(...lineItems.map((item) => item.y));
    const maxX = Math.max(...lineItems.map((item) => item.x + item.width));
    const maxY = Math.max(...lineItems.map((item) => item.y + Math.max(item.height, 8)));
    return {
      x: Math.max(0, minX - 1),
      y: Math.max(0, minY - 1),
      width: Math.max(1, maxX - minX + 2),
      height: Math.max(8, maxY - minY + 2),
    };
  });
}

function evidenceCandidates(finding: ReportFinding) {
  const values = [
    finding.documentLocation?.matchedText,
    finding.documentEvidence,
    ...sentenceFragments(finding.documentEvidence),
    finding.title,
  ].filter((value): value is string => Boolean(value && value.trim().length >= 8));
  return [...new Set(values)].sort((a, b) => b.length - a.length).slice(0, 12);
}

function sentenceFragments(text: string) {
  return text
    .split(/(?<=[.!?。！？다요음임함됨됨])\s+|\n+/)
    .map((value) => value.trim())
    .filter((value) => value.length >= 12);
}

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}/:_-]+/gu, "");
}
