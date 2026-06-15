import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";

export async function logAudit(
  action: string,
  entity: string,
  entityId: number | null,
  details: unknown,
  actor = "admin",
) {
  await db.insert(auditLogsTable).values({
    action,
    entity,
    entityId,
    details: typeof details === "string" ? details : JSON.stringify(details),
    actor,
    createdAt: new Date(),
  });
}
