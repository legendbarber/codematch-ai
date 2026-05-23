import { stores } from "../data/store.js";
import type { RetailTask, Role, Store, User } from "../domain/types.js";

export function canReadStore(user: User, store: Store): boolean {
  if (user.role === "ADMIN" || user.role === "HQ_OPERATOR") return true;
  if (user.role === "REGION_MANAGER") return user.regionId === store.regionId;
  return user.storeIds.includes(store.id);
}

export function canReadTask(user: User, task: RetailTask): boolean {
  const store = stores.find((item) => item.id === task.storeId);
  return store ? canReadStore(user, store) : false;
}

export function canCreateCampaign(user: User): boolean {
  return user.role === "ADMIN" || user.role === "HQ_OPERATOR";
}

export function canReviewEvidence(user: User, task: RetailTask): boolean {
  const store = stores.find((item) => item.id === task.storeId);
  if (!store) return false;

  if (user.role === "ADMIN" || user.role === "HQ_OPERATOR") return true;
  return user.role === "REGION_MANAGER" && user.regionId === store.regionId;
}

export function canSubmitEvidence(user: User, task: RetailTask): boolean {
  return user.role === "STORE_MANAGER" || user.role === "STORE_STAFF"
    ? user.storeIds.includes(task.storeId)
    : false;
}

export function canCancelTask(user: User, task: RetailTask): boolean {
  const store = stores.find((item) => item.id === task.storeId);
  if (!store) return false;
  if (user.role === "HQ_OPERATOR") return true;
  return user.role === "REGION_MANAGER" && user.regionId === store.regionId;
}

export function canChangeTaskDueDate(user: User, task: RetailTask): boolean {
  const store = stores.find((item) => item.id === task.storeId);
  if (!store) return false;
  if (user.role === "ADMIN" || user.role === "HQ_OPERATOR") return true;
  return user.role === "REGION_MANAGER" && user.regionId === store.regionId;
}

export function canAssignTask(user: User, task: RetailTask): boolean {
  const store = stores.find((item) => item.id === task.storeId);
  if (!store) return false;
  if (user.role === "ADMIN" || user.role === "HQ_OPERATOR") return true;
  if (user.role === "REGION_MANAGER") return user.regionId === store.regionId;
  return user.role === "STORE_MANAGER" && user.storeIds.includes(task.storeId);
}

export function canBeAssignedToTask(user: User, task: RetailTask): boolean {
  const store = stores.find((item) => item.id === task.storeId);
  if (!store) return false;
  if (user.role === "REGION_MANAGER") return user.regionId === store.regionId;
  return (user.role === "STORE_MANAGER" || user.role === "STORE_STAFF") && user.storeIds.includes(task.storeId);
}

export function canChangeUserRole(user: User, nextRole: Role): boolean {
  return user.role === "ADMIN" && nextRole !== undefined;
}
