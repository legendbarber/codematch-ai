import { tasks } from "../data/store.js";
import type { EvidenceStatus, RetailTask, TaskStatus, User } from "../domain/types.js";
import { AppError, assertRequired } from "../utils/errors.js";
import { canReadTask } from "./access-control.js";
import { recordTaskChange } from "./audit-log.js";
import { refreshTaskScores } from "./priority.js";

export interface TaskListFilters {
  status?: TaskStatus;
  assigneeId?: string;
  campaignId?: string;
  storeId?: string;
  regionId?: string;
  dueFrom?: Date;
  dueTo?: Date;
  evidenceStatus?: EvidenceStatus;
  minRiskScore?: number;
  maxRiskScore?: number;
  includeCompletedTasks?: boolean;
  page?: number;
  pageSize?: number;
}

const allowedTransitions: Record<TaskStatus, TaskStatus[]> = {
  TODO: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["EVIDENCE_SUBMITTED", "DONE", "CANCELLED"],
  EVIDENCE_SUBMITTED: ["REVIEW_REQUESTED", "CANCELLED"],
  REVIEW_REQUESTED: ["DONE", "REJECTED", "CANCELLED"],
  REJECTED: ["EVIDENCE_SUBMITTED", "CANCELLED"],
  DONE: [],
  CANCELLED: [],
};

export function listTasksForUser(user: User, filters: TaskListFilters = {}): RetailTask[] {
  return tasks
    .filter((task) => canReadTask(user, task))
    .filter((task) => task.status !== "DONE")
    .filter((task) => !filters.status || task.status === filters.status)
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

export function transitionTask(actor: User, taskId: string, nextStatus: TaskStatus, cancelReason?: string): RetailTask {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) throw new AppError("Task not found", 404);
  if (!canReadTask(actor, task)) throw new AppError("You cannot access this task", 403);

  assertRequired(nextStatus, "nextStatus");
  if (!allowedTransitions[task.status].includes(nextStatus)) {
    throw new AppError(`Transition from ${task.status} to ${nextStatus} is not allowed`, 409);
  }

  if (nextStatus === "DONE" && task.evidenceStatus !== "APPROVED") {
    throw new AppError("Evidence must be approved before completing this task", 409);
  }

  if (nextStatus === "CANCELLED" && !cancelReason) {
    throw new AppError("cancelReason is required when cancelling a task", 400);
  }

  const before = { status: task.status, cancelReason: task.cancelReason };
  task.status = nextStatus;
  if (nextStatus === "CANCELLED") task.cancelReason = cancelReason;

  refreshTaskScores(task);
  recordTaskChange(actor.id, task.id, nextStatus === "CANCELLED" ? "TASK_CANCELLED" : "TASK_STATUS_CHANGED", before, {
    status: task.status,
    cancelReason: task.cancelReason,
  });

  return task;
}
