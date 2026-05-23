import { describe, expect, it } from "vitest";
import { calculateExecutionPriority, calculateRiskScore } from "../src/services/priority.js";

describe("priority calculation", () => {
  it("uses base priority, due time, evidence state, blocker keywords, store risk, and rejection count", () => {
    const now = new Date("2026-05-20T00:00:00.000Z");
    const task = {
      storeId: "s_002",
      basePriority: "CRITICAL" as const,
      dueAt: new Date("2026-05-20T06:00:00.000Z"),
      evidenceStatus: "REJECTED" as const,
      title: "재고부족 긴급 대응",
      description: "안전 동선 확인",
      latestComment: "고객 클레임 접수",
      rejectionCount: 2,
    };

    expect(calculateExecutionPriority(task, now)).toBe(103);
    expect(calculateRiskScore(task, now)).toBe(136);
  });
});
