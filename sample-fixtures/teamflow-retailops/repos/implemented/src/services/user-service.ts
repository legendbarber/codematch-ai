import { users } from "../data/store.js";
import type { Role, User } from "../domain/types.js";
import { AppError, assertRequired } from "../utils/errors.js";
import { canChangeUserRole } from "./access-control.js";
import { recordAuditLog } from "./audit-log.js";

export function changeUserRole(actor: User, userId: string, nextRole: Role): User {
  const user = users.find((item) => item.id === userId);
  if (!user) throw new AppError("User not found", 404);

  const role = assertRequired(nextRole, "role");
  if (!canChangeUserRole(actor, role)) throw new AppError("Only admins can change user permissions", 403);

  const before = { role: user.role };
  user.role = role;

  recordAuditLog({
    actorId: actor.id,
    targetType: "USER",
    targetId: user.id,
    action: "USER_PERMISSION_CHANGED",
    before,
    after: { role: user.role },
    requestSource: "api",
  });

  return user;
}
