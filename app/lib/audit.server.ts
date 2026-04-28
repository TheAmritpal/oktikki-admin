import { db } from "~/db/index.server";
import { auditLog } from "~/db/schema";

export async function logAudit(params: {
  adminId: number;
  action: string;
  entityType: string;
  entityId?: number;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  request: Request;
}) {
  const ip = params.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = params.request.headers.get("user-agent") || "";

  await db.insert(auditLog).values({
    adminId: params.adminId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    oldValues: params.oldValues ? params.oldValues : undefined,
    newValues: params.newValues ? params.newValues : undefined,
    ipAddress: ip,
    userAgent,
  });
}