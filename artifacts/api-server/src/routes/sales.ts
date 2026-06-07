import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { serializeForZod } from "../lib/serialize";
import {
  salesTable,
  saleLinesTable,
  productsTable,
  accountsTable,
  journalEntriesTable,
  journalLinesTable,
  inventoryBatchesTable,
  receiptSettingsTable,
} from "@workspace/db";
import {
  ListSalesResponse,
  CreateSaleBody,
  GetSaleParams,
  GetSaleResponse,
  GetSaleReceiptParams,
  GetSaleReceiptResponse,
} from "@workspace/api-zod";

const router = Router();

async function getSaleEnriched(saleId: number) {
  const sale = await db.query.salesTable.findFirst({ where: eq(salesTable.id, saleId) });
  if (!sale) return null;

  const rawLines = await db
    .select({
      id: saleLinesTable.id,
      productId: saleLinesTable.productId,
      productName: productsTable.name,
      unitType: saleLinesTable.unitType,
      quantity: saleLinesTable.quantity,
      unitPrice: saleLinesTable.unitPrice,
      discount: saleLinesTable.discount,
      total: saleLinesTable.total,
    })
    .from(saleLinesTable)
    .innerJoin(productsTable, eq(saleLinesTable.productId, productsTable.id))
    .where(eq(saleLinesTable.saleId, saleId));

  const lines = rawLines.map(l => ({
    ...l,
    quantity: parseFloat(l.quantity as string),
    unitPrice: parseFloat(l.unitPrice as string),
    discount: parseFloat(l.discount as string),
    total: parseFloat(l.total as string),
  }));

  const paymentAcc = await db.query.accountsTable.findFirst({
    where: eq(accountsTable.id, sale.paymentAccountId),
  });

  return {
    ...sale,
    subtotal: parseFloat(sale.subtotal as string),
    discount: parseFloat(sale.discount as string),
    total: parseFloat(sale.total as string),
    paymentAccountName: paymentAcc?.name ?? "",
    lines,
  };
}

function generateSaleNumber(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `INV-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${Date.now().toString().slice(-5)}`;
}

router.get("/sales", async (req, res): Promise<void> => {
  let sales = await db.select().from(salesTable).orderBy(asc(salesTable.date));
  const { from, to, search } = req.query as Record<string, string>;
  if (from) sales = sales.filter(s => s.date >= from);
  if (to) sales = sales.filter(s => s.date <= to);
  if (search) {
    const s = search.toLowerCase();
    sales = sales.filter(sale =>
      sale.saleNumber.toLowerCase().includes(s) ||
      (sale.customerName && sale.customerName.toLowerCase().includes(s))
    );
  }
  const enriched = await Promise.all(sales.map(s => getSaleEnriched(s.id)));
  res.json(ListSalesResponse.parse(serializeForZod(enriched.filter(Boolean))));
});

router.post("/sales", async (req, res): Promise<void> => {
  const parsed = CreateSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const dateStr = data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date);

  // Calculate subtotal from lines
  let subtotal = 0;
  const lineValues: {
    productId: number;
    unitType: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    total: number;
    tabletsNeeded: number;
  }[] = [];

  for (const line of data.lines) {
    const product = await db.query.productsTable.findFirst({ where: eq(productsTable.id, line.productId) });
    if (!product) {
      res.status(404).json({ error: `Product ${line.productId} not found` });
      return;
    }

    const activeBatch = (await db
      .select()
      .from(inventoryBatchesTable)
      .where(eq(inventoryBatchesTable.productId, line.productId))
      .orderBy(asc(inventoryBatchesTable.expiryDate))
      .limit(1))[0];

    const tabsPerPack = activeBatch ? activeBatch.tabsPerPack : 1;
    const packsPerBox = activeBatch ? activeBatch.packsPerBox : 1;

    let tabletsNeeded = 0;
    if (line.unitType === "tablet") tabletsNeeded = line.quantity;
    else if (line.unitType === "pack") tabletsNeeded = line.quantity * tabsPerPack;
    else if (line.unitType === "box") tabletsNeeded = line.quantity * tabsPerPack * packsPerBox;

    const lineDiscount = line.discount ?? 0;
    const lineTotal = line.quantity * line.unitPrice - lineDiscount;
    subtotal += lineTotal;
    lineValues.push({ ...line, discount: lineDiscount, total: lineTotal, tabletsNeeded });
  }

  const totalDiscount = data.discount ?? 0;
  const total = subtotal - totalDiscount;

  // Deduct from inventory (FIFO by expiry date)
  for (const line of lineValues) {
    let tabletsToDeduct = line.tabletsNeeded;
    const batches = await db
      .select()
      .from(inventoryBatchesTable)
      .where(eq(inventoryBatchesTable.productId, line.productId))
      .orderBy(asc(inventoryBatchesTable.expiryDate));

    for (const batch of batches) {
      if (tabletsToDeduct <= 0) break;
      const deduct = Math.min(batch.remainingTablets, tabletsToDeduct);
      await db.update(inventoryBatchesTable)
        .set({ remainingTablets: batch.remainingTablets - deduct })
        .where(eq(inventoryBatchesTable.id, batch.id));
      tabletsToDeduct -= deduct;
    }
  }

  // Create journal entry: DR Cash/Payment, CR Revenue
  const revenueAccount = await db.query.accountsTable.findFirst({ where: eq(accountsTable.code, "4000") });
  let journalEntryId: number | null = null;

  if (revenueAccount) {
    const [entry] = await db.insert(journalEntriesTable).values({
      date: dateStr,
      description: `Sale`,
      type: "sale",
    }).returning();

    await db.insert(journalLinesTable).values([
      { journalEntryId: entry.id, accountId: data.paymentAccountId, debit: total.toString(), credit: "0", description: "Sale payment received" },
      { journalEntryId: entry.id, accountId: revenueAccount.id, debit: "0", credit: total.toString(), description: "Sales revenue" },
    ]);
    journalEntryId = entry.id;
  }

  const [sale] = await db.insert(salesTable).values({
    saleNumber: generateSaleNumber(),
    date: dateStr,
    customerName: data.customerName,
    subtotal: subtotal.toString(),
    discount: totalDiscount.toString(),
    total: total.toString(),
    paymentAccountId: data.paymentAccountId,
    journalEntryId,
  }).returning();

  await db.insert(saleLinesTable).values(
    lineValues.map(l => ({
      saleId: sale.id,
      productId: l.productId,
      unitType: l.unitType,
      quantity: l.quantity.toString(),
      unitPrice: l.unitPrice.toString(),
      discount: l.discount.toString(),
      total: l.total.toString(),
    }))
  );

  const enriched = await getSaleEnriched(sale.id);
  res.status(201).json(GetSaleResponse.parse(serializeForZod(enriched)));
});

router.get("/sales/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const sale = await getSaleEnriched(id);
  if (!sale) { res.status(404).json({ error: "Sale not found" }); return; }
  res.json(GetSaleResponse.parse(serializeForZod(sale)));
});

router.get("/sales/:id/receipt", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const sale = await getSaleEnriched(id);
  if (!sale) { res.status(404).json({ error: "Sale not found" }); return; }

  const settingsRows = await db.select().from(receiptSettingsTable);
  const settings = settingsRows[0] ?? { id: 1, storeName: null, storeAddress: null, storePhone: null, storeEmail: null, logoUrl: null, footerText: null, showLogo: true, showAddress: true, showPhone: true, showEmail: false, showTaxInfo: false, taxNumber: null };

  res.json(GetSaleReceiptResponse.parse(serializeForZod({ sale, settings })));
});

export default router;
