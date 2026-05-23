import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
import { auditLogs, campaigns, evidenceFiles, notifications, tasks, users } from "../data/store.js";
import { AppError } from "../utils/errors.js";
import { archiveCampaign, createCampaign } from "../services/campaign-service.js";
import { listTasksForUser, transitionTask } from "../services/task-service.js";
import { reviewEvidence, submitEvidence } from "../services/evidence-service.js";
import { generateOperationalNotifications } from "../services/notification-service.js";
import type { TaskStatus } from "../domain/types.js";

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
  res.json(listTasksForUser(actor, { status: queryString(req.query.status) as TaskStatus | undefined }));
});

app.post("/tasks/:taskId/transition", (req, res) => {
  res.json(transitionTask(actorFromRequest(req), req.params.taskId, req.body.nextStatus, req.body.cancelReason));
});

app.post("/tasks/:taskId/evidence", (req, res) => {
  res.status(201).json(submitEvidence(actorFromRequest(req), req.params.taskId, req.body));
});

app.post("/evidence/:evidenceId/review", (req, res) => {
  res.json(reviewEvidence(actorFromRequest(req), req.params.evidenceId, req.body.decision, req.body.rejectReason));
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
