import { Router } from "express";
import { eq, sum } from "drizzle-orm";
import { db } from "@workspace/db";
import { serializeForZod } from "../lib/serialize";
import { vendorsTable, expensesTable, inventoryBatchesTable } from "@workspace/db";
import {
  ListVendorsResponse,
  CreateVendorBody,
  GetVendorParams,
  GetVendorResponse,
  UpdateVendorParams,
  UpdateVendorBody,
  UpdateVendorResponse,
  DeleteVendorParams,
  DeleteVendorResponse,
} from "@workspace/api-zod";

const router = Router();

async function getVendorWithStats(vendorId: number) {
  const vendor = await db.query.vendorsTable.findFirst({
    where: eq(vendorsTable.id, vendorId),
  });
  if (!vendor) return null;

  const expenseRows = await db.select({ total: sum(expensesTable.amount) })
    .from(expensesTable)
    .where(eq(expensesTable.vendorId, vendorId));

  const inventoryRows = await db.select({ count: sum(inventoryBatchesTable.id) })
    .from(inventoryBatchesTable)
    .where(eq(inventoryBatchesTable.vendorId, vendorId));

  return {
    ...vendor,
    totalPurchases: 0,
    totalExpenses: parseFloat((expenseRows[0]?.total as string) || "0"),
  };
}

router.get("/vendors", async (req, res): Promise<void> => {
  const vendors = await db.select().from(vendorsTable);
  const enriched = await Promise.all(vendors.map(v => getVendorWithStats(v.id)));
  res.json(ListVendorsResponse.parse(serializeForZod(enriched.filter(Boolean))));
});

router.post("/vendors", async (req, res): Promise<void> => {
  const parsed = CreateVendorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [vendor] = await db.insert(vendorsTable).values(parsed.data as any).returning();
  const enriched = await getVendorWithStats(vendor.id);
  res.status(201).json(GetVendorResponse.parse(serializeForZod(enriched)));
});

router.get("/vendors/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const vendor = await getVendorWithStats(id);
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  res.json(GetVendorResponse.parse(serializeForZod(vendor)));
});

router.patch("/vendors/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateVendorBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [updated] = await db.update(vendorsTable)
    .set({ ...parsed.data as any, updatedAt: new Date() })
    .where(eq(vendorsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Vendor not found" }); return; }
  const enriched = await getVendorWithStats(id);
  res.json(UpdateVendorResponse.parse(serializeForZod(enriched)));
});

router.delete("/vendors/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(vendorsTable).where(eq(vendorsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Vendor not found" }); return; }
  res.json(DeleteVendorResponse.parse(serializeForZod({ ...deleted, totalPurchases: 0, totalExpenses: 0 })));
});

export default router;
