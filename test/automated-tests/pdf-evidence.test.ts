import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { parseUploadedDocument } from "@/server/document-parser";
import { createHighlightedPdf, locateFindingInPdf } from "@/server/pdf-evidence";

async function makeTextPdf(text: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([420, 320]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 48, y: 220, size: 12, font });
  return Buffer.from(await pdf.save());
}

describe("PDF evidence location", () => {
  it("extracts page text and maps evidence text to a PDF page", async () => {
    const buffer = await makeTextPdf("Danger zone automatic slow down is required.");
    const parsed = await parseUploadedDocument({
      name: "plan.pdf",
      mimeType: "application/pdf",
      size: buffer.length,
      buffer,
    });

    expect(parsed.pages?.[0].pageNumber).toBe(1);
    expect(parsed.pages?.[0].text).toContain("Danger zone");

    const location = locateFindingInPdf(
      {
        type: "missing_feature",
        severity: "low",
        title: "Danger zone slow down",
        documentEvidence: "Danger zone automatic slow down is required.",
        codeEvidence: "수집·분석된 코드 범위에서 구현 근거를 확인하지 못했습니다.",
        relatedFiles: [],
        recommendation: "구현 여부를 확인하세요.",
        confidence: 0.7,
      },
      [parsed],
    );

    expect(location?.pageNumber).toBe(1);
    expect(location?.boundingBoxes?.length).toBeGreaterThan(0);
  });

  it("creates a highlighted PDF when boxes are available", async () => {
    const buffer = await makeTextPdf("Highlight this requirement.");
    const parsed = await parseUploadedDocument({
      name: "plan.pdf",
      mimeType: "application/pdf",
      size: buffer.length,
      buffer,
    });
    const location = locateFindingInPdf(
      {
        type: "missing_feature",
        severity: "low",
        title: "Highlight",
        documentEvidence: "Highlight this requirement.",
        codeEvidence: "수집·분석된 코드 범위에서 구현 근거를 확인하지 못했습니다.",
        relatedFiles: [],
        recommendation: "구현 여부를 확인하세요.",
        confidence: 0.7,
      },
      [parsed],
    );

    expect(location).toBeTruthy();
    const highlighted = await createHighlightedPdf(buffer, location!);
    expect(highlighted.length).toBeGreaterThan(buffer.length);
  });

  it("creates one highlighted PDF with multiple evidence locations", async () => {
    const buffer = await makeTextPdf("First requirement. Second requirement.");
    const parsed = await parseUploadedDocument({
      name: "plan.pdf",
      mimeType: "application/pdf",
      size: buffer.length,
      buffer,
    });
    const first = locateFindingInPdf(
      {
        type: "missing_feature",
        severity: "low",
        title: "First",
        documentEvidence: "First requirement.",
        codeEvidence: "수집·분석된 코드 범위에서 구현 근거를 확인하지 못했습니다.",
        relatedFiles: [],
        recommendation: "구현 여부를 확인하세요.",
        confidence: 0.7,
      },
      [parsed],
    );
    const second = locateFindingInPdf(
      {
        type: "missing_feature",
        severity: "low",
        title: "Second",
        documentEvidence: "Second requirement.",
        codeEvidence: "수집·분석된 코드 범위에서 구현 근거를 확인하지 못했습니다.",
        relatedFiles: [],
        recommendation: "구현 여부를 확인하세요.",
        confidence: 0.7,
      },
      [parsed],
    );

    expect(first?.boundingBoxes?.length).toBeGreaterThan(0);
    expect(second?.boundingBoxes?.length).toBeGreaterThan(0);
    const highlighted = await createHighlightedPdf(buffer, [first!, second!]);
    expect(highlighted.length).toBeGreaterThan(buffer.length);
  });

  it("returns null when evidence cannot be mapped", async () => {
    const buffer = await makeTextPdf("Only unrelated text exists.");
    const parsed = await parseUploadedDocument({
      name: "plan.pdf",
      mimeType: "application/pdf",
      size: buffer.length,
      buffer,
    });

    const location = locateFindingInPdf(
      {
        type: "missing_feature",
        severity: "low",
        title: "Missing",
        documentEvidence: "A completely different requirement.",
        codeEvidence: "수집·분석된 코드 범위에서 구현 근거를 확인하지 못했습니다.",
        relatedFiles: [],
        recommendation: "확인하세요.",
        confidence: 0.5,
      },
      [parsed],
    );

    expect(location).toBeNull();
  });
});
