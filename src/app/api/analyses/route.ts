import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createStepRows, runAnalysis } from "@/server/analysis-runner";
import { prisma } from "@/server/db";
import { parseGithubRepoUrl } from "@/server/github";
import { createSessionId, SESSION_COOKIE, sessionCookieOptions } from "@/server/session";
import { serializeAnalysisSummary } from "@/server/serializers";
import { createAnalysisSchema, normalizeOptionsForBasis } from "@/server/validation";
import type { UploadedDocumentInput } from "@/server/types";

export const runtime = "nodejs";

export async function GET() {
  const { sessionId, isNew } = await getOrCreateSession();
  const analyses = await prisma.analysis.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const response = NextResponse.json({
    analyses: analyses.map(serializeAnalysisSummary),
  });
  setSessionCookie(response, sessionId, isNew);
  return response;
}

export async function POST(request: Request) {
  const { sessionId, isNew } = await getOrCreateSession();
  const formData = await request.formData();
  const repoUrl = String(formData.get("repoUrl") ?? "");
  const provider = String(formData.get("provider") ?? "openai");
  const comparisonBasis = String(formData.get("comparisonBasis") ?? "unknown");
  const apiKey = normalizeApiKey(formData.get("apiKey"));
  const options = {
    missingFeature: formData.get("missingFeature") !== "false",
    apiMismatch: formData.get("apiMismatch") !== "false",
    outdatedDoc: formData.get("outdatedDoc") !== "false",
  };
  const parsed = createAnalysisSchema.safeParse({ repoUrl, provider, comparisonBasis, options });

  if (!parsed.success) {
    return NextResponse.json({ error: "분석 요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const normalizedOptions = normalizeOptionsForBasis(parsed.data.comparisonBasis, parsed.data.options);

  let repoMeta: { owner: string; repo: string };
  try {
    repoMeta = parseGithubRepoUrl(parsed.data.repoUrl);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  let documents: UploadedDocumentInput[];
  try {
    documents = await extractDocuments(formData);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
  if (documents.length === 0) {
    return NextResponse.json({ error: "분석할 개발 문서를 1개 이상 업로드하세요." }, { status: 400 });
  }

  const analysis = await prisma.analysis.create({
    data: {
      sessionId,
      repoUrl: parsed.data.repoUrl,
      repoOwner: repoMeta.owner,
      repoName: repoMeta.repo,
      provider: parsed.data.provider,
      comparisonBasis: parsed.data.comparisonBasis,
      optionsJson: JSON.stringify(normalizedOptions),
      status: "queued",
    },
  });
  await createStepRows(analysis.id);

  queueMicrotask(() => {
    void runAnalysis(analysis.id, {
      repoUrl: parsed.data.repoUrl,
      provider: parsed.data.provider,
      comparisonBasis: parsed.data.comparisonBasis,
      apiKey,
      options: normalizedOptions,
      documents,
    });
  });

  const response = NextResponse.json(
    {
      analysis: serializeAnalysisSummary(analysis),
    },
    { status: 202 },
  );
  setSessionCookie(response, sessionId, isNew);
  return response;
}

function normalizeApiKey(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function getOrCreateSession() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE)?.value;
  return {
    sessionId: existing || createSessionId(),
    isNew: !existing,
  };
}

function setSessionCookie(response: NextResponse, sessionId: string, isNew: boolean) {
  if (isNew) {
    response.cookies.set(SESSION_COOKIE, sessionId, sessionCookieOptions());
  }
}

async function extractDocuments(formData: FormData): Promise<UploadedDocumentInput[]> {
  const entries = formData.getAll("documents").filter((entry): entry is File => entry instanceof File);
  const documents: UploadedDocumentInput[] = [];

  for (const file of entries.slice(0, 5)) {
    if (file.size > 5_000_000) {
      throw new Error(`${file.name} 파일이 5MB 제한을 초과했습니다.`);
    }

    documents.push({
      name: file.name,
      mimeType: file.type,
      size: file.size,
      buffer: Buffer.from(await file.arrayBuffer()),
    });
  }

  return documents;
}
