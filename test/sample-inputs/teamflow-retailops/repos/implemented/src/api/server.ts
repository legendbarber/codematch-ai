import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
import { auditLogs, campaigns, evidenceFiles, notifications, tasks, users } from "../data/store.js";
import { AppError } from "../utils/errors.js";
import { archiveCampaign, createCampaign } from "../services/campaign-service.js";
import { assignTask, listTasksForUser, transitionTask, updateTaskDueAt, type TaskListFilters } from "../services/task-service.js";
import { createEvidenceDownloadLink, reviewEvidence, submitEvidence, validateEvidenceDownloadToken } from "../services/evidence-service.js";
import { generateOperationalNotifications } from "../services/notification-service.js";
import { addTaskComment, deleteTaskComment, listTaskComments } from "../services/comment-service.js";
import { changeUserRole } from "../services/user-service.js";
import type { EvidenceStatus, TaskStatus } from "../domain/types.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

function actorFromRequest(req: Request) {
  const actorId = req.header("x-user-id") ?? "u_hq";
  const actor = users.find((user) => user.id === actorId);
  if (!actor) throw new AppError("Unknown actor", 401);
  return actor;
}

function queryString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function queryNumber(value: unknown): number | undefined {
  const text = queryString(value);
  if (!text) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}

function queryBoolean(value: unknown): boolean | undefined {
  const text = queryString(value);
  if (text === undefined) return undefined;
  return text === "true" || text === "1";
}

function taskFiltersFromRequest(req: Request): TaskListFilters {
  const dueFrom = queryString(req.query.dueFrom);
  const dueTo = queryString(req.query.dueTo);

  return {
    status: queryString(req.query.status) as TaskStatus | undefined,
    assigneeId: queryString(req.query.assigneeId),
    campaignId: queryString(req.query.campaignId),
    storeId: queryString(req.query.storeId),
    regionId: queryString(req.query.regionId),
    dueFrom: dueFrom ? new Date(dueFrom) : undefined,
    dueTo: dueTo ? new Date(dueTo) : undefined,
    evidenceStatus: queryString(req.query.evidenceStatus) as EvidenceStatus | undefined,
    minRiskScore: queryNumber(req.query.minRiskScore),
    maxRiskScore: queryNumber(req.query.maxRiskScore),
    includeCompletedTasks: queryBoolean(req.query.includeCompletedTasks) ?? false,
    page: queryNumber(req.query.page),
    pageSize: queryNumber(req.query.pageSize),
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "teamflow-retailops" });
});

app.post("/campaigns", (req, res) => {
  const result = createCampaign(actorFromRequest(req), req.body);
  res.status(201).json(result);
});

app.post("/campaigns/:campaignId/archive", (req, res) => {
  res.json(archiveCampaign(actorFromRequest(req), req.params.campaignId));
});

app.get("/tasks", (req, res) => {
  const actor = actorFromRequest(req);
  res.json(listTasksForUser(actor, taskFiltersFromRequest(req)));
});

app.post("/tasks/:taskId/transition", (req, res) => {
  res.json(transitionTask(actorFromRequest(req), req.params.taskId, req.body.nextStatus, req.body.cancelReason));
});

app.patch("/tasks/:taskId/due-at", (req, res) => {
  res.json(updateTaskDueAt(actorFromRequest(req), req.params.taskId, req.body.dueAt));
});

app.patch("/tasks/:taskId/assignee", (req, res) => {
  res.json(assignTask(actorFromRequest(req), req.params.taskId, req.body.assigneeId));
});

app.get("/tasks/:taskId/comments", (req, res) => {
  res.json(listTaskComments(actorFromRequest(req), req.params.taskId, queryBoolean(req.query.includeDeleted) ?? false));
});

app.post("/tasks/:taskId/comments", (req, res) => {
  res.status(201).json(addTaskComment(actorFromRequest(req), req.params.taskId, req.body));
});

app.delete("/tasks/:taskId/comments/:commentId", (req, res) => {
  res.json(deleteTaskComment(actorFromRequest(req), req.params.taskId, req.params.commentId));
});

app.post("/tasks/:taskId/evidence", (req, res) => {
  res.status(201).json(submitEvidence(actorFromRequest(req), req.params.taskId, req.body));
});

app.post("/evidence/:evidenceId/review", (req, res) => {
  res.json(reviewEvidence(actorFromRequest(req), req.params.evidenceId, req.body.decision, req.body.rejectReason));
});

app.get("/evidence/:evidenceId/download-link", (req, res) => {
  res.json(createEvidenceDownloadLink(actorFromRequest(req), req.params.evidenceId));
});

app.get("/evidence/:evidenceId/download", (req, res) => {
  const evidence = validateEvidenceDownloadToken(req.params.evidenceId, queryString(req.query.token) ?? "");
  res.json({ evidenceId: evidence.id, originalName: evidence.originalName, storageKey: evidence.storageKey });
});

app.patch("/users/:userId/role", (req, res) => {
  res.json(changeUserRole(actorFromRequest(req), req.params.userId, req.body.role));
});

app.get("/notifications", (_req, res) => {
  res.json(generateOperationalNotifications());
});

app.get("/debug/state", (_req, res) => {
  res.json({ users, campaigns, tasks, evidenceFiles, notifications, auditLogs });
});

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: "Unexpected server error" });
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 4010);
  app.listen(port, () => {
    console.log(`TeamFlow RetailOps API listening on http://localhost:${port}`);
  });
}

export { app };
