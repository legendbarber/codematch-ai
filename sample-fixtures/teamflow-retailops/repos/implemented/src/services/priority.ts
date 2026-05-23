import { stores } from "../data/store.js";
import type { EvidenceStatus, Priority, RetailTask } from "../domain/types.js";

const basePriorityScore: Record<Priority, number> = {
  LOW: 10,
  NORMAL: 20,
  HIGH: 35,
  CRITICAL: 50,
};

const blockerKeywords = ["영업중단", "안전", "클레임", "재고부족"];

function getDueWeight(dueAt: Date, now = new Date()): number {
  const hoursUntilDue = (dueAt.getTime() - now.getTime()) / 1000 / 60 / 60;
  if (hoursUntilDue < 0) return 30;
  if (hoursUntilDue <= 12) return 20;
  if (hoursUntilDue <= 24) return 12;
  return 0;
}

function getEvidenceWeight(evidenceStatus: EvidenceStatus): number {
  if (evidenceStatus === "MISSING") return 10;
  if (evidenceStatus === "REJECTED") return 18;
  return 0;
}

function getBlockerWeight(task: Pick<RetailTask, "title" | "description" | "latestComment">): number {
  const text = `${task.title} ${task.description} ${task.latestComment ?? ""}`;
  return blockerKeywords.some((keyword) => text.includes(keyword)) ? 15 : 0;
}

export function calculateExecutionPriority(task: Pick<RetailTask, "basePriority" | "dueAt" | "evidenceStatus" | "title" | "description" | "latestComment">, now = new Date()): number {
  return basePriorityScore[task.basePriority] + getDueWeight(task.dueAt, now) + getEvidenceWeight(task.evidenceStatus) + getBlockerWeight(task);
}

export function calculateRiskScore(task: Pick<RetailTask, "storeId" | "basePriority" | "dueAt" | "evidenceStatus" | "title" | "description" | "latestComment" | "rejectionCount">, now = new Date()): number {
  const storeRiskLevel = stores.find((store) => store.id === task.storeId)?.riskLevel ?? 0;
  return calculateExecutionPriority(task, now) + storeRiskLevel * 5 + task.rejectionCount * 4;
}

export function refreshTaskScores(task: RetailTask): RetailTask {
  task.executionPriority = calculateExecutionPriority(task);
  task.riskScore = calculateRiskScore(task);
  task.updatedAt = new Date();
  return task;
}
