import { config, notifications, tasks, users } from "../data/store.js";
import type { Notification, NotificationType, RetailTask, User } from "../domain/types.js";
import { canReadTask } from "./access-control.js";
import { createId } from "../utils/id.js";

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function recipientsForTask(task: RetailTask): User[] {
  return users.filter((user) => canReadTask(user, task) && user.role !== "ADMIN");
}

function createNotification(task: RetailTask, recipientId: string, type: NotificationType, message: string): Notification {
  const dedupeKey = `${task.id}:${recipientId}:${type}:${todayKey()}`;
  const existing = notifications.find((item) => item.dedupeKey === dedupeKey);
  if (existing) return existing;

  const notification: Notification = {
    id: createId("noti"),
    taskId: task.id,
    recipientId,
    type,
    message,
    createdAt: new Date(),
    dedupeKey,
  };

  notifications.push(notification);
  return notification;
}

export function generateOperationalNotifications(now = new Date()): Notification[] {
  for (const task of tasks) {
    if (task.status === "DONE" || task.status === "CANCELLED") continue;

    const hoursUntilDue = (task.dueAt.getTime() - now.getTime()) / 1000 / 60 / 60;
    const recipients = recipientsForTask(task);

    if (hoursUntilDue < 0) {
      for (const user of recipients) {
        createNotification(task, user.id, "OVERDUE", `Task ${task.title} is overdue`);
      }
    } else if (hoursUntilDue <= config.dueSoonThresholdHours) {
      for (const user of recipients.filter((item) => item.role === "STORE_MANAGER" || item.role === "STORE_STAFF")) {
        createNotification(task, user.id, "DUE_SOON", `Task ${task.title} is due soon`);
      }
    }

    if (task.evidenceStatus === "REJECTED") {
      for (const user of recipients.filter((item) => item.role === "STORE_MANAGER" || item.role === "STORE_STAFF")) {
        createNotification(task, user.id, "EVIDENCE_REJECTED", `Evidence was rejected for ${task.title}`);
      }
    }

    const hoursSinceReviewRequested = (now.getTime() - task.updatedAt.getTime()) / 1000 / 60 / 60;
    if (task.evidenceStatus === "PENDING_REVIEW" && hoursSinceReviewRequested >= 12) {
      for (const user of recipients.filter((item) => item.role === "REGION_MANAGER")) {
        createNotification(task, user.id, "REVIEW_WAITING", `Evidence review has been waiting for ${task.title}`);
      }
    }

    if (task.riskScore >= 80) {
      for (const user of recipients.filter((item) => item.role === "REGION_MANAGER" || item.role === "HQ_OPERATOR")) {
        createNotification(task, user.id, "HIGH_RISK_TASK", `High risk task detected: ${task.title}`);
      }
    }
  }

  return notifications;
}
