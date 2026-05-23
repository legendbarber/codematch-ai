import { stores, tasks, users } from "../data/store.js";
import type { EvidenceStatus, RetailTask, TaskStatus, User } from "../domain/types.js";
import { AppError, assertRequired } from "../utils/errors.js";
import { canAssignTask, canBeAssignedToTask, canCancelTask, canChangeTaskDueDate, canReadTask } from "./access-control.js";
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
  const page = Math.max(filters.page ?? 1, 1);
  const pageSize = Math.min(Math.max(filters.pageSize ?? 50, 1), 100);

  return tasks
    .filter((task) => canReadTask(user, task))
    .filter((task) => filters.includeCompletedTasks || task.status !== "DONE")
    .filter((task) => !filters.status || task.status === filters.status)
    .filter((task) => !filters.assigneeId || task.assigneeId === filters.assigneeId)
    .filter((task) => !filters.campaignId || task.campaignId === filters.campaignId)
    .filter((task) => !filters.storeId || task.storeId === filters.storeId)
    .filter((task) => !filters.regionId || stores.find((store) => store.id === task.storeId)?.regionId === filters.regionId)
    .filter((task) => !filters.dueFrom || task.dueAt >= filters.dueFrom)
    .filter((task) => !filters.dueTo || task.dueAt <= filters.dueTo)
    .filter((task) => !filters.evidenceStatus || task.evidenceStatus === filters.evidenceStatus)
    .filter((task) => filters.minRiskScore === undefined || task.riskScore >= filters.minRiskScore)
    .filter((task) => filters.maxRiskScore === undefined || task.riskScore <= filters.maxRiskScore)
    .sort((a, b) => {
      if (a.status === "DONE" && b.status !== "DONE") return 1;
      if (b.status === "DONE" && a.status !== "DONE") return -1;
      return b.riskScore - a.riskScore || a.dueAt.getTime() - b.dueAt.getTime() || b.updatedAt.getTime() - a.updatedAt.getTime();
    })
    .slice((page - 1) * pageSize, page * pageSize);
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
  if (nextStatus === "CANCELLED" && !canCancelTask(actor, task)) {
    throw new AppError("Only HQ operators or region managers can cancel tasks", 403);
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

export function updateTaskDueAt(actor: User, taskId: string, dueAt: string): RetailTask {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) throw new AppError("Task not found", 404);
  if (!canReadTask(actor, task)) throw new AppError("You cannot access this task", 403);
  if (!canChangeTaskDueDate(actor, task)) throw new AppError("You cannot change this task due date", 403);

  const before = { dueAt: task.dueAt };
  task.dueAt = new Date(assertRequired(dueAt, "dueAt"));
  refreshTaskScores(task);
  recordTaskChange(actor.id, task.id, "TASK_DUE_DATE_CHANGED", before, { dueAt: task.dueAt });
  return task;
}

export function assignTask(actor: User, taskId: string, assigneeId: string): RetailTask {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) throw new AppError("Task not found", 404);
  if (!canReadTask(actor, task)) throw new AppError("You cannot access this task", 403);
  if (!canAssignTask(actor, task)) throw new AppError("You cannot assign this task", 403);

  const assignee = users.find((item) => item.id === assertRequired(assigneeId, "assigneeId"));
  if (!assignee) throw new AppError("Assignee not found", 404);
  if (!canBeAssignedToTask(assignee, task)) throw new AppError("Assignee does not belong to this store or region", 400);

  const before = { assigneeId: task.assigneeId };
  task.assigneeId = assignee.id;
  refreshTaskScores(task);
  recordTaskChange(actor.id, task.id, "TASK_ASSIGNEE_CHANGED", before, { assigneeId: task.assigneeId });
  return task;
}
