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
    oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
    newValues: params.newValues ? JSON.stringify(params.newValues) : null,
    ipAddress: ip,
    userAgent,
  });
}