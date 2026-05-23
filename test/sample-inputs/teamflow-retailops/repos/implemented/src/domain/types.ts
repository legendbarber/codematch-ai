export type Role =
  | "ADMIN"
  | "HQ_OPERATOR"
  | "REGION_MANAGER"
  | "STORE_MANAGER"
  | "STORE_STAFF";

export type TaskStatus =
  | "TODO"
  | "IN_PROGRESS"
  | "EVIDENCE_SUBMITTED"
  | "REVIEW_REQUESTED"
  | "DONE"
  | "REJECTED"
  | "CANCELLED";

export type EvidenceStatus = "MISSING" | "PENDING_REVIEW" | "APPROVED" | "REJECTED";
export type CampaignStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type Priority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

export type NotificationType =
  | "DUE_SOON"
  | "OVERDUE"
  | "EVIDENCE_REJECTED"
  | "REVIEW_WAITING"
  | "HIGH_RISK_TASK";

export type AuditAction =
  | "TASK_STATUS_CHANGED"
  | "TASK_ASSIGNEE_CHANGED"
  | "TASK_CANCELLED"
  | "TASK_DUE_DATE_CHANGED"
  | "COMMENT_ADDED"
  | "COMMENT_DELETED"
  | "EVIDENCE_ADDED"
  | "EVIDENCE_REVIEWED"
  | "CAMPAIGN_ARCHIVED"
  | "USER_PERMISSION_CHANGED";

export interface User {
  id: string;
  name: string;
  role: Role;
  regionId?: string;
  storeIds: string[];
}

export interface Store {
  id: string;
  name: string;
  regionId: string;
  riskLevel: number;
  timeZoneOffsetMinutes: number;
}

export interface Campaign {
  id: string;
  title: string;
  description: string;
  status: CampaignStatus;
  basePriority: Priority;
  evidenceRequired: boolean;
  defaultDueAt: Date;
  defaultDueAtInput: string;
  targetStoreIds: string[];
  createdBy: string;
  createdAt: Date;
  archivedAt?: Date;
}

export interface RetailTask {
  id: string;
  campaignId: string;
  storeId: string;
  title: string;
  description: string;
  status: TaskStatus;
  evidenceStatus: EvidenceStatus;
  basePriority: Priority;
  assigneeId?: string;
  dueAt: Date;
  latestComment?: string;
  rejectionCount: number;
  executionPriority: number;
  riskScore: number;
  updatedAt: Date;
  cancelReason?: string;
}

export interface EvidenceFile {
  id: string;
  taskId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: Date;
  status: EvidenceStatus;
  rejectReason?: string;
  storageKey: string;
}

export interface EvidenceDownloadLink {
  evidenceId: string;
  token: string;
  url: string;
  expiresAt: Date;
  createdBy: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  attachmentRefs: string[];
  createdAt: Date;
  deletedAt?: Date;
  deletedBy?: string;
}

export interface Notification {
  id: string;
  taskId: string;
  recipientId: string;
  type: NotificationType;
  message: string;
  createdAt: Date;
  readAt?: Date;
  dedupeKey: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  targetType: "TASK" | "EVIDENCE" | "CAMPAIGN" | "COMMENT" | "USER";
  targetId: string;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
  occurredAt: Date;
  requestSource: string;
}

export interface RuntimeConfig {
  dueSoonThresholdHours: number;
  maxEvidenceSizeMb: number;
  downloadUrlTtlMinutes: number;
}
