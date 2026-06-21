import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireAdmin } from "../lib/admin";
import { logAudit } from "../lib/audit";
import { serializeForZod } from "../lib/serialize";
import {
  salesTable,
  saleLinesTable,
  salesReturnsTable,
  salesReturnLinesTable,
  productsTable,
  accountsTable,
  journalEntriesTable,
  journalLinesTable,
  inventoryBatchesTable,
} from "@workspace/db";
import {
  CreateSalesReturnBody,
  ListSalesReturnsResponse,
  SalesReturnResponse,
} from "@workspace/api-zod";

const router = Router();

function generateReturnNumber(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `SRET-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${Date.now().toString().slice(-5)}`;
}

function tabletsForUnit(unitType: string, quantity: number, tabsPerPack: number, packsPerBox: number): number {
  if (unitType === "pack") return quantity * tabsPerPack;
  if (unitType === "box") return quantity * tabsPerPack * packsPerBox;
  return quantity;
}

async function getSalesReturnEnriched(returnId: number) {
  const ret = await db.query.salesReturnsTable.findFirst({ where: eq(salesReturnsTable.id, returnId) });
  if (!ret) return null;

  const rawLines = await db
    .select({
      id: salesReturnLinesTable.id,
      productId: salesReturnLinesTable.productId,
      productName: productsTable.name,
      unitType: salesReturnLinesTable.unitType,
      quantity: salesReturnLinesTable.quantity,
      unitPrice: salesReturnLinesTable.unitPrice,
      discount: salesReturnLinesTable.discount,
      total: salesReturnLinesTable.total,
    })
    .from(salesReturnLinesTable)
    .innerJoin(productsTable, eq(salesReturnLinesTable.productId, productsTable.id))
    .where(eq(salesReturnLinesTable.salesReturnId, returnId));

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

  return {
    ...ret,
    subtotal: parseFloat(ret.subtotal as string),
    total: parseFloat(ret.total as string),
    paymentAccountName: paymentAcc?.name ?? "",
    lines,
  };
}

router.get("/sales-returns", async (_req, res): Promise<void> => {
  const returns = await db.select().from(salesReturnsTable).orderBy(asc(salesReturnsTable.date));
  const enriched = await Promise.all(returns.map(r => getSalesReturnEnriched(r.id)));
  res.json(ListSalesReturnsResponse.parse(serializeForZod(enriched.filter(Boolean))));
});

router.get("/sales-returns/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const ret = await getSalesReturnEnriched(id);
  if (!ret) { res.status(404).json({ error: "Sales return not found" }); return; }
  res.json(SalesReturnResponse.parse(serializeForZod(ret)));
});

router.post("/sales/:id/return", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const saleId = parseInt(raw, 10);
  if (isNaN(saleId)) { res.status(400).json({ error: "Invalid sale id" }); return; }

  const parsed = CreateSalesReturnBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const dateStr = data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date);

  const originalSale = await db.query.salesTable.findFirst({ where: eq(salesTable.id, saleId) });
  if (!originalSale) {
    res.status(404).json({ error: "Original sale not found" });
    return;
  }

  // Validate returned quantities against original sale lines
  const originalLines = await db.select().from(saleLinesTable).where(eq(saleLinesTable.saleId, saleId));
  for (const line of data.lines) {
    const origLine = originalLines.find(l => l.productId === line.productId && l.unitType === line.unitType);
    if (!origLine) {
      res.status(400).json({ error: `Product ${line.productId} (${line.unitType}) not found in original sale` });
      return;
    }
    const origQty = parseFloat(origLine.quantity as string);
    if (line.quantity > origQty) {
      res.status(400).json({ error: `Return quantity ${line.quantity} exceeds original quantity ${origQty} for product ${line.productId}` });
      return;
    }
  }

  let subtotal = 0;
  let totalCogs = 0;
  const lineValues: Array<{
    productId: number; unitType: string; quantity: number;
    unitPrice: number; discount: number; total: number; tabletsToRestore: number;
  }> = [];

  for (const line of data.lines) {
    const product = await db.query.productsTable.findFirst({ where: eq(productsTable.id, line.productId) });
    if (!product) { res.status(404).json({ error: `Product ${line.productId} not found` }); return; }

    const activeBatch = (await db.select().from(inventoryBatchesTable)
      .where(eq(inventoryBatchesTable.productId, line.productId))
      .orderBy(asc(inventoryBatchesTable.expiryDate)).limit(1))[0];
    const tabsPerPack = activeBatch?.tabsPerPack ?? 1;
    const packsPerBox = activeBatch?.packsPerBox ?? 1;

    const tabletsToRestore = tabletsForUnit(line.unitType, line.quantity, tabsPerPack, packsPerBox);
    const lineDiscount = line.discount ?? 0;
    const lineTotal = line.quantity * line.unitPrice - lineDiscount;
    subtotal += lineTotal;

    // Calculate COGS for returned items (from original batch cost)
    const batch = (await db.select().from(inventoryBatchesTable)
      .where(eq(inventoryBatchesTable.productId, line.productId))
      .orderBy(asc(inventoryBatchesTable.expiryDate)).limit(1))[0];
    const costPerUnit = batch ? parseFloat(batch.costPerUnit as string) : 0;
    totalCogs += tabletsToRestore * costPerUnit;

    lineValues.push({ ...line, discount: lineDiscount, total: lineTotal, tabletsToRestore });
  }

  // Create reversal journal entry: CR Cash, DR Revenue, DR Inventory, CR COGS
  const revenueAccount = await db.query.accountsTable.findFirst({ where: eq(accountsTable.code, "4000") });
  const cogsAccount = await db.query.accountsTable.findFirst({ where: eq(accountsTable.code, "5000") });
  const inventoryAccount = await db.query.accountsTable.findFirst({ where: eq(accountsTable.code, "1300") });
  let journalEntryId: number | null = null;

  if (revenueAccount) {
    const [entry] = await db.insert(journalEntriesTable).values({
      date: dateStr,
      description: `Sales return - ${originalSale.saleNumber}`,
      type: "sale_return",
    }).returning();

    const journalLines: Array<{ journalEntryId: number; accountId: number; debit: string; credit: string; description: string }> = [
      { journalEntryId: entry.id, accountId: data.paymentAccountId, debit: "0", credit: subtotal.toString(), description: "Refund to customer" },
      { journalEntryId: entry.id, accountId: revenueAccount.id, debit: subtotal.toString(), credit: "0", description: "Revenue reversal" },
    ];

    if (cogsAccount && inventoryAccount && totalCogs > 0) {
      journalLines.push(
        { journalEntryId: entry.id, accountId: inventoryAccount.id, debit: totalCogs.toFixed(2), credit: "0", description: "Inventory restored" },
        { journalEntryId: entry.id, accountId: cogsAccount.id, debit: "0", credit: totalCogs.toFixed(2), description: "COGS reversal" },
      );
    }

    await db.insert(journalLinesTable).values(journalLines);
    journalEntryId = entry.id;
  }

  // Restore inventory (add back to nearest-expiry active batch)
  for (const line of lineValues) {
    const batch = (await db.select().from(inventoryBatchesTable)
      .where(eq(inventoryBatchesTable.productId, line.productId))
      .orderBy(asc(inventoryBatchesTable.expiryDate)).limit(1))[0];
    if (batch) {
      await db.update(inventoryBatchesTable)
        .set({ remainingTablets: batch.remainingTablets + line.tabletsToRestore })
        .where(eq(inventoryBatchesTable.id, batch.id));
    }
  }

  const [returnRecord] = await db.insert(salesReturnsTable).values({
    returnNumber: generateReturnNumber(),
    date: dateStr,
    originalSaleId: saleId,
    customerName: originalSale.customerName,
    subtotal: subtotal.toString(),
    total: subtotal.toString(),
    paymentAccountId: data.paymentAccountId,
    journalEntryId,
    reason: data.reason,
  }).returning();

  await db.insert(salesReturnLinesTable).values(
    lineValues.map(l => ({
      salesReturnId: returnRecord.id,
      productId: l.productId,
      unitType: l.unitType,
      quantity: l.quantity.toString(),
      unitPrice: l.unitPrice.toString(),
      discount: l.discount.toString(),
      total: l.total.toString(),
    }))
  );

  await logAudit("sale.return", "sale_return", returnRecord.id, {
    returnNumber: returnRecord.returnNumber,
    originalSaleId: saleId,
    total: subtotal,
    lineCount: lineValues.length,
  });

  const enriched = await getSalesReturnEnriched(returnRecord.id);
  res.status(201).json(SalesReturnResponse.parse(serializeForZod(enriched)));
});

export default router;
