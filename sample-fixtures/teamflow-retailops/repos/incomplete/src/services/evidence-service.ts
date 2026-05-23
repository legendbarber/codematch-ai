import { config, evidenceFiles, tasks } from "../data/store.js";
import type { EvidenceFile, User } from "../domain/types.js";
import { AppError, assertRequired } from "../utils/errors.js";
import { createId } from "../utils/id.js";
import { canReadTask, canReviewEvidence, canSubmitEvidence } from "./access-control.js";
import { recordAuditLog, recordTaskChange } from "./audit-log.js";
import { refreshTaskScores } from "./priority.js";

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
]);

export interface EvidenceUploadInput {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export function submitEvidence(actor: User, taskId: string, input: EvidenceUploadInput): EvidenceFile {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) throw new AppError("Task not found", 404);
  if (!canSubmitEvidence(actor, task)) throw new AppError("You cannot submit evidence for this task", 403);

  const originalName = assertRequired(input.originalName, "originalName");
  const mimeType = assertRequired(input.mimeType, "mimeType");
  const sizeBytes = assertRequired(input.sizeBytes, "sizeBytes");

  if (!allowedMimeTypes.has(mimeType)) throw new AppError("Evidence file type is not allowed", 415);
  if (sizeBytes > config.maxEvidenceSizeMb * 1024 * 1024) throw new AppError("Evidence file is too large", 413);

  const evidence: EvidenceFile = {
    id: createId("ev"),
    taskId,
    originalName,
    mimeType,
    sizeBytes,
    uploadedBy: actor.id,
    uploadedAt: new Date(),
    status: "PENDING_REVIEW",
    storageKey: `evidence/${taskId}/${createId("file")}-${originalName}`,
  };

  evidenceFiles.push(evidence);

  const before = { status: task.status, evidenceStatus: task.evidenceStatus };
  task.evidenceStatus = "PENDING_REVIEW";
  task.status = "EVIDENCE_SUBMITTED";
  refreshTaskScores(task);

  recordAuditLog({
    actorId: actor.id,
    targetType: "EVIDENCE",
    targetId: evidence.id,
    action: "EVIDENCE_ADDED",
    before: undefined,
    after: { originalName, mimeType, sizeBytes, taskId },
    requestSource: "api",
  });
  recordTaskChange(actor.id, task.id, "TASK_STATUS_CHANGED", before, {
    status: task.status,
    evidenceStatus: task.evidenceStatus,
  });

  return evidence;
}

export function reviewEvidence(actor: User, evidenceId: string, decision: "APPROVED" | "REJECTED", rejectReason?: string): EvidenceFile {
  const evidence = evidenceFiles.find((item) => item.id === evidenceId);
  if (!evidence) throw new AppError("Evidence not found", 404);
  const task = tasks.find((item) => item.id === evidence.taskId);
  if (!task) throw new AppError("Task not found", 404);
  if (!canReviewEvidence(actor, task)) throw new AppError("You cannot review this evidence", 403);

  if (decision === "REJECTED" && !rejectReason) {
    throw new AppError("rejectReason is required when rejecting evidence", 400);
  }

  const beforeEvidence = { status: evidence.status, rejectReason: evidence.rejectReason };
  evidence.status = decision;
  evidence.rejectReason = decision === "REJECTED" ? rejectReason : undefined;

  const beforeTask = { status: task.status, evidenceStatus: task.evidenceStatus, rejectionCount: task.rejectionCount };
  task.evidenceStatus = decision;
  task.status = decision === "APPROVED" ? "REVIEW_REQUESTED" : "REJECTED";
  if (decision === "REJECTED") task.rejectionCount += 1;
  refreshTaskScores(task);

  recordAuditLog({
    actorId: actor.id,
    targetType: "EVIDENCE",
    targetId: evidence.id,
    action: "EVIDENCE_REVIEWED",
    before: beforeEvidence,
    after: { status: evidence.status, rejectReason: evidence.rejectReason },
    requestSource: "api",
  });
  recordTaskChange(actor.id, task.id, "TASK_STATUS_CHANGED", beforeTask, {
    status: task.status,
    evidenceStatus: task.evidenceStatus,
    rejectionCount: task.rejectionCount,
  });

  return evidence;
}
