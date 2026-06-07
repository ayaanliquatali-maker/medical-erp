import { Router } from "express";
import { eq, and, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import { serializeForZod } from "../lib/serialize";
import {
  inventoryBatchesTable,
  productsTable,
  vendorsTable,
  journalEntriesTable,
  journalLinesTable,
  accountsTable,
} from "@workspace/db";
import {
  ListInventoryResponse,
  ReceiveInventoryBody,
  GetInventoryBatchParams,
  GetInventoryBatchResponse,
  UpdateInventoryBatchParams,
  UpdateInventoryBatchBody,
  UpdateInventoryBatchResponse,
  GetInventoryAlertsResponse,
} from "@workspace/api-zod";

const router = Router();

async function enrichBatch(batch: typeof inventoryBatchesTable.$inferSelect) {
  const product = await db.query.productsTable.findFirst({
    where: eq(productsTable.id, batch.productId),
  });
  const vendor = batch.vendorId
    ? await db.query.vendorsTable.findFirst({ where: eq(vendorsTable.id, batch.vendorId) })
    : null;

  return {
    ...batch,
    costPerUnit: parseFloat(batch.costPerUnit as string),
    sellingPricePerUnit: parseFloat(batch.sellingPricePerUnit as string),
    sellingPricePerPack: parseFloat(batch.sellingPricePerPack as string),
    sellingPricePerBox: parseFloat(batch.sellingPricePerBox as string),
    productName: product?.name ?? "",
    vendorName: vendor?.name ?? null,
    remainingPacks: batch.remainingTablets / batch.tabsPerPack,
    remainingBoxes: batch.remainingTablets / batch.tabsPerPack / batch.packsPerBox,
  };
}

router.get("/inventory/alerts", async (_req, res): Promise<void> => {
  const products = await db.select().from(productsTable).where(eq(productsTable.isActive, true));
  const allBatches = await db.select().from(inventoryBatchesTable);
  const today = new Date().toISOString().slice(0, 10);
  const in30Days = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const outOfStock = [];
  const lowStock = [];

  for (const product of products) {
    const productBatches = allBatches.filter(b => b.productId === product.id);
    const totalTablets = productBatches.reduce((sum, b) => sum + b.remainingTablets, 0);
    const nearestExpiry = productBatches
      .filter(b => b.remainingTablets > 0)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0]?.expiryDate ?? null;

    const activeBatch = productBatches
      .filter(b => b.remainingTablets > 0 && b.expiryDate >= today)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0];

    const tabsPerPack = activeBatch?.tabsPerPack ?? 1;
    const packsPerBox = activeBatch?.packsPerBox ?? 1;
    const totalPacks = totalTablets / tabsPerPack;
    const totalBoxes = totalPacks / packsPerBox;

    const enrichedProduct = {
      ...product,
      totalTablets,
      totalPacks,
      totalBoxes,
      nearestExpiry,
    };

    if (totalTablets === 0) outOfStock.push(enrichedProduct);
    else if (totalTablets <= product.reorderLevel) lowStock.push(enrichedProduct);
  }

  const nearExpiry = (await Promise.all(
    allBatches
      .filter(b => b.remainingTablets > 0 && b.expiryDate <= in30Days && b.expiryDate >= today)
      .map(enrichBatch)
  ));

  const expired = (await Promise.all(
    allBatches
      .filter(b => b.remainingTablets > 0 && b.expiryDate < today)
      .map(enrichBatch)
  ));

  res.json(GetInventoryAlertsResponse.parse(serializeForZod({ outOfStock, lowStock, nearExpiry, expired })));
});

router.get("/inventory", async (req, res): Promise<void> => {
  let batches = await db.select().from(inventoryBatchesTable);
  const { productId, nearExpiry } = req.query as Record<string, string>;

  if (productId) {
    const pid = parseInt(productId, 10);
    batches = batches.filter(b => b.productId === pid);
  }

  if (nearExpiry === "true") {
    const in30Days = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    batches = batches.filter(b => b.expiryDate <= in30Days);
  }

  const enriched = await Promise.all(batches.map(enrichBatch));
  res.json(ListInventoryResponse.parse(serializeForZod(enriched)));
});

router.post("/inventory", async (req, res): Promise<void> => {
  const parsed = ReceiveInventoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const totalTablets = data.boxesPurchased * data.packsPerBox * data.tabsPerPack;
  const totalCost = totalTablets * data.costPerUnit;

  // Validate vendor exists if provided
  if (data.vendorId !== undefined) {
    const vendor = await db.query.vendorsTable.findFirst({
      where: eq(vendorsTable.id, data.vendorId),
    });
    if (!vendor) {
      res.status(400).json({ error: `Vendor #${data.vendorId} not found. Please select a valid vendor or choose "None".` });
      return;
    }
  }

  let journalEntryId: number | null = null;

  if (data.paymentAccountId) {
    const inventoryAccount = await db.query.accountsTable.findFirst({
      where: eq(accountsTable.code, "1300"),
    });

    if (inventoryAccount) {
      const [entry] = await db.insert(journalEntriesTable).values({
        date: new Date().toISOString().slice(0, 10),
        description: `Inventory received`,
        type: "purchase",
      }).returning();

      await db.insert(journalLinesTable).values([
        {
          journalEntryId: entry.id,
          accountId: inventoryAccount.id,
          debit: totalCost.toString(),
          credit: "0",
          description: "Inventory purchase",
        },
        {
          journalEntryId: entry.id,
          accountId: data.paymentAccountId,
          debit: "0",
          credit: totalCost.toString(),
          description: "Payment for inventory",
        },
      ]);

      journalEntryId = entry.id;
    }
  }

  const [batch] = await db.insert(inventoryBatchesTable).values({
    productId: data.productId,
    batchNumber: data.batchNumber,
    unitType: data.unitType,
    boxesPurchased: data.boxesPurchased,
    packsPerBox: data.packsPerBox,
    tabsPerPack: data.tabsPerPack,
    totalTablets,
    remainingTablets: totalTablets,
    costPerUnit: data.costPerUnit.toString(),
    sellingPricePerUnit: data.sellingPricePerUnit?.toString() ?? "0",
    sellingPricePerPack: data.sellingPricePerPack?.toString() ?? "0",
    sellingPricePerBox: data.sellingPricePerBox?.toString() ?? "0",
    expiryDate: data.expiryDate instanceof Date ? data.expiryDate.toISOString().slice(0, 10) : String(data.expiryDate),
    vendorId: data.vendorId,
    journalEntryId,
    notes: data.notes,
  }).returning();

  const enriched = await enrichBatch(batch);
  res.status(201).json(GetInventoryBatchResponse.parse(serializeForZod(enriched)));
});

router.get("/inventory/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const batch = await db.query.inventoryBatchesTable.findFirst({ where: eq(inventoryBatchesTable.id, id) });
  if (!batch) { res.status(404).json({ error: "Batch not found" }); return; }
  const enriched = await enrichBatch(batch);
  res.json(GetInventoryBatchResponse.parse(serializeForZod(enriched)));
});

router.patch("/inventory/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateInventoryBatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.batchNumber !== undefined) updateData.batchNumber = parsed.data.batchNumber;
  if (parsed.data.costPerUnit !== undefined) updateData.costPerUnit = parsed.data.costPerUnit.toString();
  if (parsed.data.expiryDate !== undefined) updateData.expiryDate = parsed.data.expiryDate;
  if (parsed.data.vendorId !== undefined) updateData.vendorId = parsed.data.vendorId;

  const [updated] = await db.update(inventoryBatchesTable)
    .set(updateData)
    .where(eq(inventoryBatchesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Batch not found" }); return; }
  const enriched = await enrichBatch(updated);
  res.json(UpdateInventoryBatchResponse.parse(serializeForZod(enriched)));
});

export default router;
