import { campaigns, stores, tasks } from "../data/store.js";
import type { Campaign, Priority, RetailTask, User } from "../domain/types.js";
import { AppError, assertRequired } from "../utils/errors.js";
import { createId } from "../utils/id.js";
import { canCreateCampaign } from "./access-control.js";
import { recordAuditLog } from "./audit-log.js";
import { refreshTaskScores } from "./priority.js";

export interface CreateCampaignInput {
  title: string;
  description: string;
  targetStoreIds: string[];
  defaultDueAt: string;
  basePriority?: Priority;
  evidenceRequired?: boolean;
}

function parseStoreLocalDueAt(value: string, storeId: string): Date {
  const dateOnlyMatch = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/.exec(value);
  if (!dateOnlyMatch?.groups) return new Date(value);

  const store = stores.find((item) => item.id === storeId);
  const offset = store?.timeZoneOffsetMinutes ?? 0;
  const year = Number(dateOnlyMatch.groups.year);
  const month = Number(dateOnlyMatch.groups.month);
  const day = Number(dateOnlyMatch.groups.day);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59) - offset * 60 * 1000);
}

export function createCampaign(actor: User, input: CreateCampaignInput): { campaign: Campaign; createdTasks: RetailTask[] } {
  if (!canCreateCampaign(actor)) {
    throw new AppError("Only HQ operators can create campaigns", 403);
  }

  const title = assertRequired(input.title, "title");
  const targetStoreIds = assertRequired(input.targetStoreIds, "targetStoreIds");
  const defaultDueAtInput = assertRequired(input.defaultDueAt, "defaultDueAt");
  const missingStore = targetStoreIds.find((storeId) => !stores.some((store) => store.id === storeId));
  if (missingStore) throw new AppError(`Store not found: ${missingStore}`, 404);

  const campaign: Campaign = {
    id: createId("camp"),
    title,
    description: input.description ?? "",
    status: "ACTIVE",
    basePriority: input.basePriority ?? "NORMAL",
    evidenceRequired: input.evidenceRequired ?? true,
    defaultDueAt: parseStoreLocalDueAt(defaultDueAtInput, targetStoreIds[0]!),
    defaultDueAtInput,
    targetStoreIds,
    createdBy: actor.id,
    createdAt: new Date(),
  };

  campaigns.push(campaign);
  const createdTasks = generateTasksForCampaign(campaign);
  return { campaign, createdTasks };
}

export function generateTasksForCampaign(campaign: Campaign): RetailTask[] {
  if (campaign.status === "ARCHIVED") {
    throw new AppError("Archived campaign cannot create new tasks", 409);
  }

  const createdTasks = campaign.targetStoreIds.map((storeId) => {
    const task: RetailTask = {
      id: createId("task"),
      campaignId: campaign.id,
      storeId,
      title: campaign.title,
      description: campaign.description,
      status: "TODO",
      evidenceStatus: campaign.evidenceRequired ? "MISSING" : "APPROVED",
      basePriority: campaign.basePriority,
      dueAt: parseStoreLocalDueAt(campaign.defaultDueAtInput, storeId),
      rejectionCount: 0,
      executionPriority: 0,
      riskScore: 0,
      updatedAt: new Date(),
    };

    return refreshTaskScores(task);
  });

  tasks.push(...createdTasks);
  return createdTasks;
}

export function archiveCampaign(actor: User, campaignId: string): Campaign {
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new AppError("Campaign not found", 404);
  if (!canCreateCampaign(actor)) throw new AppError("Only HQ operators can archive campaigns", 403);

  const before = { status: campaign.status };
  campaign.status = "ARCHIVED";
  campaign.archivedAt = new Date();

  recordAuditLog({
    actorId: actor.id,
    targetType: "CAMPAIGN",
    targetId: campaign.id,
    action: "CAMPAIGN_ARCHIVED",
    before,
    after: { status: campaign.status },
    requestSource: "api",
  });

  return campaign;
}
