import { Router } from "express";
import { db } from "@workspace/db";
import { serializeForZod } from "../lib/serialize";
import { receiptSettingsTable } from "@workspace/db";
import {
  GetReceiptSettingsResponse,
  UpdateReceiptSettingsBody,
  UpdateReceiptSettingsResponse,
} from "@workspace/api-zod";

const router = Router();

async function getOrCreateSettings() {
  let rows = await db.select().from(receiptSettingsTable);
  if (rows.length === 0) {
    const [row] = await db.insert(receiptSettingsTable).values({}).returning();
    return row;
  }
  return rows[0];
}

router.get("/receipt-settings", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json(GetReceiptSettingsResponse.parse(serializeForZod(settings)));
});

router.patch("/receipt-settings", async (req, res): Promise<void> => {
  const parsed = UpdateReceiptSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await getOrCreateSettings();
  const [updated] = await db.update(receiptSettingsTable)
    .set(parsed.data as any)
    .returning();

  res.json(UpdateReceiptSettingsResponse.parse(serializeForZod(updated ?? existing)));
});

export default router;
