import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { SESSION_COOKIE } from "@/server/session";
import { serializeAnalysis } from "@/server/serializers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  const { id } = await context.params;

  if (!sessionId) {
    return NextResponse.json({ error: "분석 세션을 찾을 수 없습니다." }, { status: 404 });
  }

  const analysis = await prisma.analysis.findFirst({
    where: {
      id,
      sessionId,
    },
    include: {
      documents: true,
      findings: {
        orderBy: [{ severity: "asc" }, { createdAt: "asc" }],
      },
      steps: {
        orderBy: { order: "asc" },
      },
    },
  });

  if (!analysis) {
    return NextResponse.json({ error: "분석 결과를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ analysis: serializeAnalysis(analysis) });
}
