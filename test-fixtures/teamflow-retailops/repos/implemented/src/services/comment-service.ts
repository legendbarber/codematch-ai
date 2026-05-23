import { taskComments, tasks } from "../data/store.js";
import type { TaskComment, User } from "../domain/types.js";
import { AppError, assertRequired } from "../utils/errors.js";
import { createId } from "../utils/id.js";
import { canReadTask } from "./access-control.js";
import { recordAuditLog } from "./audit-log.js";
import { refreshTaskScores } from "./priority.js";

export interface AddTaskCommentInput {
  body: string;
  attachmentRefs?: string[];
}

function getAccessibleTask(actor: User, taskId: string) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) throw new AppError("Task not found", 404);
  if (!canReadTask(actor, task)) throw new AppError("You cannot access this task", 403);
  return task;
}

export function listTaskComments(actor: User, taskId: string, includeDeleted = false): TaskComment[] {
  getAccessibleTask(actor, taskId);
  return taskComments.filter((comment) => comment.taskId === taskId && (includeDeleted || !comment.deletedAt));
}

export function addTaskComment(actor: User, taskId: string, input: AddTaskCommentInput): TaskComment {
  const task = getAccessibleTask(actor, taskId);
  const body = assertRequired(input.body, "body").trim();

  if (!body) throw new AppError("body is required", 400);
  if (body.length > 2000) throw new AppError("Comment body is too long", 400);
  if (/<\s*script/i.test(body)) throw new AppError("Comment body contains blocked markup", 400);

  const comment: TaskComment = {
    id: createId("comment"),
    taskId,
    authorId: actor.id,
    body,
    attachmentRefs: input.attachmentRefs ?? [],
    createdAt: new Date(),
  };

  taskComments.push(comment);
  task.latestComment = body;
  refreshTaskScores(task);

  recordAuditLog({
    actorId: actor.id,
    targetType: "COMMENT",
    targetId: comment.id,
    action: "COMMENT_ADDED",
    after: { taskId, body, attachmentRefs: comment.attachmentRefs },
    requestSource: "api",
  });

  return comment;
}

export function deleteTaskComment(actor: User, taskId: string, commentId: string): TaskComment {
  getAccessibleTask(actor, taskId);
  const comment = taskComments.find((item) => item.id === commentId && item.taskId === taskId);
  if (!comment) throw new AppError("Comment not found", 404);
  if (comment.deletedAt) return comment;
  if (comment.authorId !== actor.id && actor.role !== "ADMIN" && actor.role !== "HQ_OPERATOR") {
    throw new AppError("You cannot delete this comment", 403);
  }

  const before = { deletedAt: comment.deletedAt, deletedBy: comment.deletedBy };
  comment.deletedAt = new Date();
  comment.deletedBy = actor.id;

  recordAuditLog({
    actorId: actor.id,
    targetType: "COMMENT",
    targetId: comment.id,
    action: "COMMENT_DELETED",
    before,
    after: { deletedAt: comment.deletedAt, deletedBy: comment.deletedBy },
    requestSource: "api",
  });

  return comment;
}
