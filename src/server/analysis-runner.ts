import { analyzeRepository } from "./analyzer";
import {
  artifactExpiresAt,
  artifactStorageEnabled,
  sanitizeFileName,
  saveArtifactBuffer,
} from "./artifact-storage";
import { chunkSourceFiles } from "./chunker";
import { collectRepository, parseGithubRepoUrl } from "./github";
import { parseUploadedDocuments } from "./document-parser";
import { prisma } from "./db";
import { createHighlightedPdf, locateFindingInPdf } from "./pdf-evidence";
import type {
  AnalysisOptions,
  AnalysisStatus,
  ComparisonBasis,
  DocumentEvidenceLocation,
  ParsedDocument,
  Provider,
  ReportFinding,
  UploadedDocumentInput,
} from "./types";

export const ANALYSIS_STEPS = [
  { key: "repo", label: "Repository URL 확인" },
  { key: "collect", label: "GitHub 코드 수집" },
  { key: "parse", label: "문서 Parsing" },
  { key: "analyze", label: "AI 비교 분석" },
  { key: "report", label: "결과 리포트 생성" },
] as const;

type RunAnalysisInput = {
  repoUrl: string;
  provider: Provider;
  comparisonBasis: ComparisonBasis;
  apiKey?: string;
  options: AnalysisOptions;
  documents: UploadedDocumentInput[];
};

export async function createStepRows(analysisId: string) {
  await prisma.analysisStep.createMany({
    data: ANALYSIS_STEPS.map((step, index) => ({
      analysisId,
      key: step.key,
      label: step.label,
      order: index + 1,
    })),
  });
}

export async function runAnalysis(analysisId: string, input: RunAnalysisInput) {
  try {
    await updateStatus(analysisId, "collecting");
    await runStep(analysisId, "repo", async () => {
      parseGithubRepoUrl(input.repoUrl);
    });

    const repository = await runStep(analysisId, "collect", async () => collectRepository(input.repoUrl));
    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        repoOwner: repository.owner,
        repoName: repository.repo,
      },
    });

    await updateStatus(analysisId, "parsing");
    const parsedDocuments = await runStep(analysisId, "parse", async () => {
      const parsed = await parseUploadedDocuments(input.documents);
      await saveDocumentMetadata(analysisId, parsed);
      return parsed;
    });

    await updateStatus(analysisId, "analyzing");
    const chunks = chunkSourceFiles(repository.files);
    const report = await runStep(analysisId, "analyze", async () =>
      analyzeRepository({
        provider: input.provider,
        apiKey: input.apiKey,
        comparisonBasis: input.comparisonBasis,
        options: input.options,
        repository,
        documents: parsedDocuments,
        chunks,
      }),
    );

    await updateStatus(analysisId, "reporting");
    await runStep(analysisId, "report", async () => {
      const findings = await enrichFindingsWithArtifacts(analysisId, {
        comparisonBasis: input.comparisonBasis,
        findings: report.findings,
        parsedDocuments,
        uploadedDocuments: input.documents,
      });
      const scope = {
        collectedCodeFileCount: repository.files.length,
        codeChunkCount: chunks.length,
        documentChunkCount: parsedDocuments.reduce((sum, document) => sum + document.chunks.length, 0),
        warnings: repository.warnings,
        githubTreeTruncated: repository.warnings.some((warning) => warning.includes("tree 응답")),
        highlightMappingFailures: findings.filter(
          (finding) => finding.documentLocation?.highlightStatus === "mapping_failed",
        ).length,
      };
      await prisma.finding.deleteMany({ where: { analysisId } });
      await prisma.finding.createMany({
        data: findings.map((finding) => toFindingRow(analysisId, finding)),
      });
      await prisma.analysis.update({
        where: { id: analysisId },
        data: {
          summary: report.summary,
          totalsJson: JSON.stringify({ ...computeTotals(findings), scope }),
          status: "completed",
          completedAt: new Date(),
        },
      });
    });
  } catch (error) {
    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      },
    });
  }
}

async function runStep<T>(
  analysisId: string,
  key: (typeof ANALYSIS_STEPS)[number]["key"],
  action: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  await prisma.analysisStep.update({
    where: { analysisId_key: { analysisId, key } },
    data: { status: "running", message: null },
  });

  try {
    const result = await action();
    await prisma.analysisStep.update({
      where: { analysisId_key: { analysisId, key } },
      data: {
        status: "completed",
        durationMs: Date.now() - startedAt,
      },
    });
    return result;
  } catch (error) {
    await prisma.analysisStep.update({
      where: { analysisId_key: { analysisId, key } },
      data: {
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      },
    });
    throw error;
  }
}

async function updateStatus(analysisId: string, status: AnalysisStatus) {
  await prisma.analysis.update({
    where: { id: analysisId },
    data: { status },
  });
}

async function saveDocumentMetadata(analysisId: string, documents: ParsedDocument[]) {
  await prisma.uploadedDocument.deleteMany({ where: { analysisId } });
  await prisma.uploadedDocument.createMany({
    data: documents.map((document) => ({
      analysisId,
      name: document.name,
      mimeType: document.mimeType,
      size: document.size,
      extractedChars: document.text.length,
    })),
  });
}

function toFindingRow(analysisId: string, finding: ReportFinding) {
  return {
    analysisId,
    type: finding.type,
    severity: finding.severity,
    title: finding.title,
    documentEvidence: finding.documentEvidence,
    codeEvidence: finding.codeEvidence,
    relatedFilesJson: JSON.stringify(finding.relatedFiles),
    documentLocationJson: JSON.stringify(finding.documentLocation ?? {}),
    codeLocationsJson: JSON.stringify(finding.codeLocations ?? []),
    recommendation: finding.recommendation,
    confidence: finding.confidence,
  };
}

type ArtifactEnrichmentInput = {
  comparisonBasis: ComparisonBasis;
  findings: ReportFinding[];
  parsedDocuments: ParsedDocument[];
  uploadedDocuments: UploadedDocumentInput[];
};

async function enrichFindingsWithArtifacts(
  analysisId: string,
  input: ArtifactEnrichmentInput,
): Promise<ReportFinding[]> {
  if (input.comparisonBasis !== "document_latest") {
    return input.findings;
  }

  const pdfUploads = input.uploadedDocuments.filter((document) => {
    const name = document.name.toLowerCase();
    return document.mimeType === "application/pdf" || name.endsWith(".pdf");
  });
  if (!pdfUploads.length) return input.findings;

  const enriched: ReportFinding[] = [];
  const highlightable: Array<{ finding: ReportFinding; location: DocumentEvidenceLocation }> = [];
  for (const finding of input.findings) {
    if (finding.type !== "missing_feature" && finding.type !== "api_mismatch") {
      enriched.push(finding);
      continue;
    }

    const location = locateFindingInPdf(finding, input.parsedDocuments);
    if (!location?.boundingBoxes?.length) {
      enriched.push({
        ...finding,
        documentLocation: {
          ...(location ?? finding.documentLocation ?? {
            documentName: input.parsedDocuments[0]?.name ?? "uploaded document",
          }),
          highlightStatus: "mapping_failed",
          highlightMessage:
            "이 PDF에서는 텍스트 위치를 정확히 확인할 수 없어 하이라이트 파일을 생성하지 못했습니다. 텍스트 근거는 아래 리포트에서 확인할 수 있습니다.",
        },
      });
      continue;
    }

    highlightable.push({ finding, location });
  }

  if (!highlightable.length) {
    return enriched;
  }

  if (!artifactStorageEnabled()) {
    return [
      ...enriched,
      ...highlightable.map(({ finding, location }) => ({
        ...finding,
        documentLocation: {
          ...location,
          highlightStatus: "storage_unavailable",
          highlightMessage: "현재 서버 설정에서 하이라이트 PDF artifact 저장소가 비활성화되어 있습니다.",
        } satisfies DocumentEvidenceLocation,
      })),
    ];
  }

  const artifactIdsByDocument = await createCombinedHighlightArtifacts(analysisId, pdfUploads, highlightable);
  return [
    ...enriched,
    ...highlightable.map(({ finding, location }) => {
      const artifactId = artifactIdsByDocument.get(location.documentName);
      if (!artifactId) {
        return {
          ...finding,
          documentLocation: {
            ...location,
            highlightStatus: "mapping_failed",
            highlightMessage: "하이라이트 PDF 통합 artifact 생성에 실패했습니다.",
          } satisfies DocumentEvidenceLocation,
        };
      }
      return {
        ...finding,
        documentLocation: {
          ...location,
          highlightStatus: "created",
          artifactId,
          highlightMessage: "업로드된 원본 PDF 복사본 하나에 이 분석의 문서 근거 위치를 모두 노란색으로 표시했습니다.",
        } satisfies DocumentEvidenceLocation,
      };
    }),
  ];
}

async function createCombinedHighlightArtifacts(
  analysisId: string,
  pdfUploads: UploadedDocumentInput[],
  highlightable: Array<{ finding: ReportFinding; location: DocumentEvidenceLocation }>,
) {
  const artifactIdsByDocument = new Map<string, string>();
  const locationsByDocument = new Map<string, DocumentEvidenceLocation[]>();
  for (const { location } of highlightable) {
    locationsByDocument.set(location.documentName, [...(locationsByDocument.get(location.documentName) ?? []), location]);
  }

  for (const [documentName, locations] of locationsByDocument) {
    const source = pdfUploads.find((document) => document.name === documentName) ?? pdfUploads[0];
    try {
      const pdfBuffer = await createHighlightedPdf(source.buffer, locations);
      const fileName = `${sanitizeFileName(source.name.replace(/\.pdf$/i, ""))}-highlighted-all.pdf`;
      const stored = await saveArtifactBuffer(fileName, pdfBuffer);
      const artifact = await prisma.generatedArtifact.create({
        data: {
          analysisId,
          type: "highlighted_source_pdf_combined",
          fileName,
          mimeType: "application/pdf",
          storageKey: stored.storageKey,
          size: stored.size,
          expiresAt: artifactExpiresAt(),
        },
      });
      artifactIdsByDocument.set(documentName, artifact.id);
    } catch {
      // Individual findings keep a mapping failure message when no combined artifact id is available.
    }
  }

  return artifactIdsByDocument;
}

function computeTotals(findings: ReportFinding[]) {
  return {
    total: findings.length,
    missingFeature: findings.filter((finding) => finding.type === "missing_feature").length,
    apiMismatch: findings.filter((finding) => finding.type === "api_mismatch").length,
    outdatedDoc: findings.filter((finding) => finding.type === "outdated_doc").length,
    high: findings.filter((finding) => finding.severity === "high").length,
    medium: findings.filter((finding) => finding.severity === "medium").length,
    low: findings.filter((finding) => finding.severity === "low").length,
  };
}
