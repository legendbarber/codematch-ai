import type {
  AuditLog,
  Campaign,
  EvidenceDownloadLink,
  EvidenceFile,
  Notification,
  RetailTask,
  RuntimeConfig,
  Store,
  TaskComment,
  User,
} from "../domain/types.js";

export const config: RuntimeConfig = {
  dueSoonThresholdHours: 12,
  maxEvidenceSizeMb: 20,
  downloadUrlTtlMinutes: 5,
};

export const users: User[] = [
  { id: "u_admin", name: "Admin", role: "ADMIN", storeIds: [] },
  { id: "u_hq", name: "HQ Operator", role: "HQ_OPERATOR", storeIds: [] },
  { id: "u_region_east", name: "East Region Manager", role: "REGION_MANAGER", regionId: "r_east", storeIds: [] },
  { id: "u_store_1_mgr", name: "Store 1 Manager", role: "STORE_MANAGER", regionId: "r_east", storeIds: ["s_001"] },
  { id: "u_store_1_staff", name: "Store 1 Staff", role: "STORE_STAFF", regionId: "r_east", storeIds: ["s_001"] },
];

export const stores: Store[] = [
  { id: "s_001", name: "Gangnam Flagship", regionId: "r_east", riskLevel: 3, timeZoneOffsetMinutes: 540 },
  { id: "s_002", name: "Jamsil Outlet", regionId: "r_east", riskLevel: 5, timeZoneOffsetMinutes: 540 },
  { id: "s_101", name: "Busan Central", regionId: "r_south", riskLevel: 2, timeZoneOffsetMinutes: 540 },
];

export const campaigns: Campaign[] = [];
export const tasks: RetailTask[] = [];
export const evidenceFiles: EvidenceFile[] = [];
export const evidenceDownloadLinks: EvidenceDownloadLink[] = [];
export const taskComments: TaskComment[] = [];
export const notifications: Notification[] = [];
export const auditLogs: AuditLog[] = [];
