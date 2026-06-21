import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireAdmin } from "../lib/admin";
import { logAudit } from "../lib/audit";
import { serializeForZod } from "../lib/serialize";
import {
  purchaseReturnsTable,
  purchaseReturnLinesTable,
  inventoryBatchesTable,
  productsTable,
  accountsTable,
  journalEntriesTable,
  journalLinesTable,
  vendorsTable,
} from "@workspace/db";
import {
  CreatePurchaseReturnBody,
  ListPurchaseReturnsResponse,
  PurchaseReturnResponse,
} from "@workspace/api-zod";

const router = Router();

function generateReturnNumber(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `PRET-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${Date.now().toString().slice(-5)}`;
}

function tabletsForUnit(unitType: string, quantity: number, tabsPerPack: number, packsPerBox: number): number {
  if (unitType === "pack") return quantity * tabsPerPack;
  if (unitType === "box") return quantity * tabsPerPack * packsPerBox;
  return quantity;
}

async function getPurchaseReturnEnriched(returnId: number) {
  const ret = await db.query.purchaseReturnsTable.findFirst({ where: eq(purchaseReturnsTable.id, returnId) });
  if (!ret) return null;

  const rawLines = await db
    .select({
      id: purchaseReturnLinesTable.id,
      productId: purchaseReturnLinesTable.productId,
      productName: productsTable.name,
      unitType: purchaseReturnLinesTable.unitType,
      quantity: purchaseReturnLinesTable.quantity,
      unitPrice: purchaseReturnLinesTable.unitPrice,
      discount: purchaseReturnLinesTable.discount,
      total: purchaseReturnLinesTable.total,
    })
    .from(purchaseReturnLinesTable)
    .innerJoin(productsTable, eq(purchaseReturnLinesTable.productId, productsTable.id))
    .where(eq(purchaseReturnLinesTable.purchaseReturnId, returnId));

  const lines = rawLines.map(l => ({
    ...l,
    quantity: parseFloat(l.quantity as string),
    unitPrice: parseFloat(l.unitPrice as string),
    discount: parseFloat(l.discount as string),
    total: parseFloat(l.total as string),
  }));

  const paymentAcc = await db.query.accountsTable.findFirst({
    where: eq(accountsTable.id, ret.paymentAccountId),
  });

  const batch = await db.query.inventoryBatchesTable.findFirst({
    where: eq(inventoryBatchesTable.id, ret.originalBatchId),
  });

  const vendor = ret.vendorId
    ? await db.query.vendorsTable.findFirst({ where: eq(vendorsTable.id, ret.vendorId) })
    : null;

  return {
    ...ret,
    batchNumber: batch?.batchNumber ?? null,
    vendorName: vendor?.name ?? null,
    subtotal: parseFloat(ret.subtotal as string),
    total: parseFloat(ret.total as string),
    paymentAccountName: paymentAcc?.name ?? "",
    lines,
  };
}

router.get("/purchase-returns", async (_req, res): Promise<void> => {
  const returns = await db.select().from(purchaseReturnsTable).orderBy(asc(purchaseReturnsTable.date));
  const enriched = await Promise.all(returns.map(r => getPurchaseReturnEnriched(r.id)));
  res.json(ListPurchaseReturnsResponse.parse(serializeForZod(enriched.filter(Boolean))));
});

router.get("/purchase-returns/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const ret = await getPurchaseReturnEnriched(id);
  if (!ret) { res.status(404).json({ error: "Purchase return not found" }); return; }
  res.json(PurchaseReturnResponse.parse(serializeForZod(ret)));
});

router.post("/inventory/:id/return", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const batchId = parseInt(raw, 10);
  if (isNaN(batchId)) { res.status(400).json({ error: "Invalid batch id" }); return; }

  const parsed = CreatePurchaseReturnBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const dateStr = data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date);

  const originalBatch = await db.query.inventoryBatchesTable.findFirst({ where: eq(inventoryBatchesTable.id, batchId) });
  if (!originalBatch) {
    res.status(404).json({ error: "Original inventory batch not found" });
    return;
  }

  // Validate quantities
  let subtotal = 0;
  const lineValues: Array<{
    productId: number; unitType: string; quantity: number;
    unitPrice: number; discount: number; total: number; tabletsToDeduct: number;
  }> = [];

  for (const line of data.lines) {
    const product = await db.query.productsTable.findFirst({ where: eq(productsTable.id, line.productId) });
    if (!product) { res.status(404).json({ error: `Product ${line.productId} not found` }); return; }

    const tabsPerPack = originalBatch.tabsPerPack;
    const packsPerBox = originalBatch.packsPerBox;
    const tabletsToDeduct = tabletsForUnit(line.unitType, line.quantity, tabsPerPack, packsPerBox);

    if (tabletsToDeduct > originalBatch.remainingTablets) {
      res.status(400).json({
        error: `Return quantity exceeds remaining stock. Batch has ${originalBatch.remainingTablets} tablets remaining.`,
      });
      return;
    }

    const lineDiscount = line.discount ?? 0;
    const lineTotal = line.quantity * line.unitPrice - lineDiscount;
    subtotal += lineTotal;

    lineValues.push({ ...line, discount: lineDiscount, total: lineTotal, tabletsToDeduct });
  }

  // Create reversal journal entry: CR Inventory, DR Payment (refund)
  const inventoryAccount = await db.query.accountsTable.findFirst({ where: eq(accountsTable.code, "1300") });
  let journalEntryId: number | null = null;

  if (inventoryAccount) {
    const [entry] = await db.insert(journalEntriesTable).values({
      date: dateStr,
      description: `Purchase return - batch ${originalBatch.batchNumber ?? originalBatch.id}`,
      type: "purchase_return",
    }).returning();

    await db.insert(journalLinesTable).values([
      { journalEntryId: entry.id, accountId: inventoryAccount.id, debit: "0", credit: subtotal.toString(), description: "Inventory returned" },
      { journalEntryId: entry.id, accountId: data.paymentAccountId, debit: subtotal.toString(), credit: "0", description: "Refund from vendor" },
    ]);
    journalEntryId = entry.id;
  }

  // Deduct inventory from batch
  let remainingDeduct = lineValues.reduce((sum, l) => sum + l.tabletsToDeduct, 0);
  await db.update(inventoryBatchesTable)
    .set({ remainingTablets: originalBatch.remainingTablets - remainingDeduct })
    .where(eq(inventoryBatchesTable.id, batchId));

  const [returnRecord] = await db.insert(purchaseReturnsTable).values({
    returnNumber: generateReturnNumber(),
    date: dateStr,
    originalBatchId: batchId,
    vendorId: data.originalBatchId ? originalBatch.vendorId : null,
    subtotal: subtotal.toString(),
    total: subtotal.toString(),
    paymentAccountId: data.paymentAccountId,
    journalEntryId,
    reason: data.reason,
  }).returning();

  await db.insert(purchaseReturnLinesTable).values(
    lineValues.map(l => ({
      purchaseReturnId: returnRecord.id,
      productId: l.productId,
      unitType: l.unitType,
      quantity: l.quantity.toString(),
      unitPrice: l.unitPrice.toString(),
      discount: l.discount.toString(),
      total: l.total.toString(),
    }))
  );

  await logAudit("inventory.return", "purchase_return", returnRecord.id, {
    returnNumber: returnRecord.returnNumber,
    originalBatchId: batchId,
    total: subtotal,
    lineCount: lineValues.length,
  });

  const enriched = await getPurchaseReturnEnriched(returnRecord.id);
  res.status(201).json(PurchaseReturnResponse.parse(serializeForZod(enriched)));
});

export default router;
