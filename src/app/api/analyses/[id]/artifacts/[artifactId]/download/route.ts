import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readArtifactBuffer, sanitizeFileName } from "@/server/artifact-storage";
import { prisma } from "@/server/db";
import { SESSION_COOKIE } from "@/server/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
    artifactId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  const { id, artifactId } = await context.params;

  if (!sessionId) {
    return NextResponse.json({ error: "분석 세션을 찾을 수 없습니다." }, { status: 404 });
  }

  const artifact = await prisma.generatedArtifact.findFirst({
    where: {
      id: artifactId,
      analysisId: id,
      analysis: {
        sessionId,
      },
    },
  });

  if (!artifact) {
    return NextResponse.json({ error: "artifact를 찾을 수 없습니다." }, { status: 404 });
  }

  if (artifact.expiresAt && artifact.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "artifact 보존 기간이 만료되었습니다." }, { status: 410 });
  }

  try {
    const buffer = await readArtifactBuffer(artifact.storageKey);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": artifact.mimeType,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename="${sanitizeFileName(artifact.fileName)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "artifact 파일을 읽지 못했습니다." },
      { status: 404 },
    );
  }
}
