import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { generateDocumentationDraftWithGemini } from "@/server/analyzer/gemini";
import { prisma } from "@/server/db";
import { SESSION_COOKIE } from "@/server/session";
import type { CodeLocation } from "@/server/types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
    findingId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  const { id, findingId } = await context.params;

  if (!sessionId) {
    return NextResponse.json({ error: "분석 세션을 찾을 수 없습니다." }, { status: 404 });
  }

  const analysis = await prisma.analysis.findFirst({
    where: { id, sessionId },
    include: {
      findings: {
        where: { id: findingId },
        take: 1,
      },
    },
  });

  if (!analysis || analysis.findings.length === 0) {
    return NextResponse.json({ error: "분석 결과 또는 finding을 찾을 수 없습니다." }, { status: 404 });
  }

  if ((analysis.comparisonBasis ?? "unknown") !== "code_latest") {
    return NextResponse.json(
      { error: "문서 추가 초안은 GitHub 코드가 최신 기준인 분석에서만 생성할 수 있습니다." },
      { status: 400 },
    );
  }

  const finding = analysis.findings[0];
  if (finding.type !== "outdated_doc") {
    return NextResponse.json(
      { error: "문서 최신화 대상 finding에서만 초안을 생성할 수 있습니다." },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const apiKey = typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : undefined;
  if (!apiKey && !process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "문서 초안 생성에는 Gemini API key가 필요합니다. 서버 환경변수 또는 요청 시점 key를 입력하세요." },
      { status: 400 },
    );
  }

  const codeLocations = parseJson<CodeLocation[]>(finding.codeLocationsJson, []);
  const draft = await generateDocumentationDraftWithGemini({
    apiKey,
    findingTitle: finding.title,
    codeEvidence: finding.codeEvidence,
    documentEvidence: finding.documentEvidence,
    recommendation: finding.recommendation,
    codeLocations,
  });

  await prisma.documentationDraft.create({
    data: {
      analysisId: analysis.id,
      findingId: finding.id,
      draftJson: JSON.stringify(draft),
    },
  });

  return NextResponse.json({ draft });
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
