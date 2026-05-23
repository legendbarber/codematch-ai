import { beforeEach, describe, expect, it } from "vitest";
import { auditLogs, campaigns, evidenceDownloadLinks, evidenceFiles, notifications, taskComments, tasks, users } from "../src/data/store.js";
import { createCampaign } from "../src/services/campaign-service.js";
import { addTaskComment, deleteTaskComment } from "../src/services/comment-service.js";
import { createEvidenceDownloadLink, reviewEvidence, submitEvidence, validateEvidenceDownloadToken } from "../src/services/evidence-service.js";
import { generateOperationalNotifications } from "../src/services/notification-service.js";
import { assignTask, listTasksForUser, transitionTask, updateTaskDueAt } from "../src/services/task-service.js";
import { changeUserRole } from "../src/services/user-service.js";

describe("retail task flow", () => {
  beforeEach(() => {
    campaigns.length = 0;
    tasks.length = 0;
    evidenceFiles.length = 0;
    evidenceDownloadLinks.length = 0;
    taskComments.length = 0;
    notifications.length = 0;
    auditLogs.length = 0;
    users.find((user) => user.id === "u_store_1_staff")!.role = "STORE_STAFF";
  });

  it("creates store tasks, requires evidence review, and records audit logs", () => {
    const hq = users.find((user) => user.id === "u_hq")!;
    const staff = users.find((user) => user.id === "u_store_1_staff")!;
    const regionManager = users.find((user) => user.id === "u_region_east")!;

    const { createdTasks } = createCampaign(hq, {
      title: "월간 냉장고 안전 점검",
      description: "사진 증빙을 제출하세요.",
      targetStoreIds: ["s_001"],
      defaultDueAt: "2026-05-20T12:00:00.000Z",
      basePriority: "HIGH",
      evidenceRequired: true,
    });

    const task = createdTasks[0]!;
    transitionTask(staff, task.id, "IN_PROGRESS");
    expect(() => transitionTask(staff, task.id, "DONE")).toThrow("Evidence must be approved");

    const evidence = submitEvidence(staff, task.id, {
      originalName: "proof.png",
      mimeType: "image/png",
      sizeBytes: 1024,
    });
    reviewEvidence(regionManager, evidence.id, "APPROVED");
    const updated = transitionTask(regionManager, task.id, "DONE");

    expect(updated.status).toBe("DONE");
    expect(auditLogs.map((log) => log.action)).toContain("EVIDENCE_ADDED");
    expect(auditLogs.map((log) => log.action)).toContain("EVIDENCE_REVIEWED");
  });

  it("supports comments, secure evidence links, due date and permission audit logs", () => {
    const admin = users.find((user) => user.id === "u_admin")!;
    const hq = users.find((user) => user.id === "u_hq")!;
    const staff = users.find((user) => user.id === "u_store_1_staff")!;

    const { createdTasks } = createCampaign(hq, {
      title: "신규 진열 가이드 적용",
      description: "현장 메모와 사진 증빙을 남기세요.",
      targetStoreIds: ["s_001"],
      defaultDueAt: "2026-05-20",
      basePriority: "NORMAL",
      evidenceRequired: true,
    });

    const task = createdTasks[0]!;
    expect(task.dueAt.toISOString()).toBe("2026-05-20T14:59:59.000Z");

    const comment = addTaskComment(staff, task.id, {
      body: "진열대 교체 완료 전 상태입니다.",
      attachmentRefs: ["photo-before"],
    });
    deleteTaskComment(staff, task.id, comment.id);

    const evidence = submitEvidence(staff, task.id, {
      originalName: "proof.png",
      mimeType: "image/png",
      sizeBytes: 1024,
    });
    const link = createEvidenceDownloadLink(staff, evidence.id, new Date("2026-05-20T00:00:00.000Z"));

    expect(validateEvidenceDownloadToken(evidence.id, link.token, new Date("2026-05-20T00:04:59.000Z")).id).toBe(evidence.id);
    expect(() => validateEvidenceDownloadToken(evidence.id, link.token, new Date("2026-05-20T00:05:01.000Z"))).toThrow("expired");

    updateTaskDueAt(hq, task.id, "2026-05-21T12:00:00.000Z");
    assignTask(hq, task.id, staff.id);
    changeUserRole(admin, staff.id, "STORE_MANAGER");

    expect(auditLogs.map((log) => log.action)).toEqual(
      expect.arrayContaining(["COMMENT_ADDED", "COMMENT_DELETED", "TASK_DUE_DATE_CHANGED", "TASK_ASSIGNEE_CHANGED", "USER_PERMISSION_CHANGED"]),
    );
  });

  it("filters task lists, restricts cancellation, and creates review waiting notifications", () => {
    const hq = users.find((user) => user.id === "u_hq")!;
    const staff = users.find((user) => user.id === "u_store_1_staff")!;
    const regionManager = users.find((user) => user.id === "u_region_east")!;

    const { createdTasks } = createCampaign(hq, {
      title: "검수 대기 업무",
      description: "사진 증빙을 제출하세요.",
      targetStoreIds: ["s_001", "s_002"],
      defaultDueAt: "2026-05-20T12:00:00.000Z",
      basePriority: "HIGH",
      evidenceRequired: true,
    });

    const firstTask = createdTasks[0]!;
    transitionTask(staff, firstTask.id, "IN_PROGRESS");
    submitEvidence(staff, firstTask.id, {
      originalName: "proof.png",
      mimeType: "image/png",
      sizeBytes: 1024,
    });
    firstTask.updatedAt = new Date("2026-05-20T00:00:00.000Z");

    expect(() => transitionTask(staff, firstTask.id, "CANCELLED", "매장 요청")).toThrow("Only HQ operators");
    expect(transitionTask(regionManager, firstTask.id, "CANCELLED", "긴급 운영 중단").status).toBe("CANCELLED");

    const activeTasks = listTasksForUser(hq, { status: "TODO", storeId: "s_002", includeCompletedTasks: false });
    expect(activeTasks).toHaveLength(1);
    expect(activeTasks[0]!.storeId).toBe("s_002");

    firstTask.status = "EVIDENCE_SUBMITTED";
    firstTask.updatedAt = new Date("2026-05-20T00:00:00.000Z");
    generateOperationalNotifications(new Date("2026-05-20T13:00:00.000Z"));

    expect(notifications.some((notification) => notification.type === "REVIEW_WAITING" && notification.recipientId === regionManager.id)).toBe(true);
  });
});
