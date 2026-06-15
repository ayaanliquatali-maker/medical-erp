import { Router } from "express";
import { desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import { getAdminPassword, isAdminRequest, requireAdmin, signAdminCookie, clearAdminCookie } from "../lib/admin";
import { logAudit } from "../lib/audit";

const router = Router();

router.post("/admin/login", async (req, res): Promise<void> => {
  const { password } = req.body as { password?: string };
  if (password !== getAdminPassword()) {
    res.status(401).json({ error: "Invalid admin password" });
    return;
  }

  signAdminCookie(res);
  await logAudit("admin.login", "auth", null, { success: true }, "admin");
  res.json({ ok: true });
});

router.post("/admin/logout", requireAdmin, async (req, res): Promise<void> => {
  clearAdminCookie(res);
  await logAudit("admin.logout", "auth", null, { success: true }, "admin");
  res.json({ ok: true });
});

router.get("/admin/status", (req, res): void => {
  res.json({ isAdmin: isAdminRequest(req) });
});

router.get("/admin/audit-logs", requireAdmin, async (req, res): Promise<void> => {
  const logs = await db
    .select()
    .from(auditLogsTable)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(100);

  res.json(logs);
});

router.delete("/admin/audit-logs", requireAdmin, async (req, res): Promise<void> => {
  await db.delete(auditLogsTable).execute();
  await logAudit("audit.clear", "audit", null, { cleared: true }, "admin");
  res.status(204).send();
});

router.post("/admin/audit-logs/clear", requireAdmin, async (req, res): Promise<void> => {
  await db.delete(auditLogsTable).execute();
  await logAudit("audit.clear", "audit", null, { cleared: true }, "admin");
  res.status(204).send();
});

export default router;
