import { analyzeRepository } from "./analyzer";
import { chunkSourceFiles } from "./chunker";
import { collectRepository, parseGithubRepoUrl } from "./github";
import { parseUploadedDocuments } from "./document-parser";
import { prisma } from "./db";
import type {
  AnalysisOptions,
  AnalysisStatus,
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
        options: input.options,
        repository,
        documents: parsedDocuments,
        chunks,
      }),
    );

    await updateStatus(analysisId, "reporting");
    await runStep(analysisId, "report", async () => {
      await prisma.finding.deleteMany({ where: { analysisId } });
      await prisma.finding.createMany({
        data: report.findings.map((finding) => toFindingRow(analysisId, finding)),
      });
      await prisma.analysis.update({
        where: { id: analysisId },
        data: {
          summary: report.summary,
          totalsJson: JSON.stringify(computeTotals(report.findings)),
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
    recommendation: finding.recommendation,
    confidence: finding.confidence,
  };
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
