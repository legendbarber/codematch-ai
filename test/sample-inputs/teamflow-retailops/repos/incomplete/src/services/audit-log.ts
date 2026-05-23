import { auditLogs } from "../data/store.js";
import type { AuditAction, AuditLog } from "../domain/types.js";
import { createId } from "../utils/id.js";

export function recordAuditLog(input: Omit<AuditLog, "id" | "occurredAt">): AuditLog {
  const log: AuditLog = {
    id: createId("audit"),
    occurredAt: new Date(),
    ...input,
  };

  auditLogs.push(log);
  return log;
}

export function recordTaskChange(actorId: string, taskId: string, action: AuditAction, before: unknown, after: unknown): AuditLog {
  return recordAuditLog({
    actorId,
    targetType: "TASK",
    targetId: taskId,
    action,
    before,
    after,
    requestSource: "api",
  });
}
