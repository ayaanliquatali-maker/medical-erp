import { Router } from "express";
import { eq, and, gte, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import { serializeForZod } from "../lib/serialize";
import { journalEntriesTable, journalLinesTable, accountsTable, salesTable, expensesTable, inventoryBatchesTable } from "@workspace/db";
import { requireAdmin } from "../lib/admin";
import { logAudit } from "../lib/audit";
import {
  ListJournalsResponse,
  CreateJournalBody,
  GetJournalParams,
  GetJournalResponse,
  DeleteJournalParams,
  DeleteJournalResponse,
} from "@workspace/api-zod";

const router = Router();

async function getJournalWithLines(journalId: number) {
  const entry = await db.query.journalEntriesTable.findFirst({
    where: eq(journalEntriesTable.id, journalId),
  });
  if (!entry) return null;

  const rawLines = await db
    .select({
      id: journalLinesTable.id,
      accountId: journalLinesTable.accountId,
      accountName: accountsTable.name,
      debit: journalLinesTable.debit,
      credit: journalLinesTable.credit,
      description: journalLinesTable.description,
    })
    .from(journalLinesTable)
    .innerJoin(accountsTable, eq(journalLinesTable.accountId, accountsTable.id))
    .where(eq(journalLinesTable.journalEntryId, journalId));

  const lines = rawLines.map(l => ({
    ...l,
    debit: parseFloat(l.debit as string),
    credit: parseFloat(l.credit as string),
  }));

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  return { ...entry, lines, totalDebit, totalCredit };
}

router.get("/journals", async (req, res): Promise<void> => {
  let entries = await db.select().from(journalEntriesTable).orderBy(journalEntriesTable.date);

  const { from, to, type } = req.query as Record<string, string>;
  if (from) entries = entries.filter(e => e.date >= from);
  if (to) entries = entries.filter(e => e.date <= to);
  if (type) entries = entries.filter(e => e.type === type);

  const enriched = await Promise.all(entries.map(e => getJournalWithLines(e.id)));
  res.json(ListJournalsResponse.parse(serializeForZod(enriched.filter(Boolean))));
});

router.post("/journals", async (req, res): Promise<void> => {
  const parsed = CreateJournalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { lines, ...entryData } = parsed.data;
  const dateStr = entryData.date instanceof Date ? entryData.date.toISOString().slice(0, 10) : String(entryData.date);

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    res.status(400).json({ error: "Total debits must equal total credits" });
    return;
  }

  const [entry] = await db.insert(journalEntriesTable).values({
    date: dateStr,
    description: entryData.description,
    reference: entryData.reference,
    type: "manual",
  }).returning();

  await db.insert(journalLinesTable).values(
    lines.map(l => ({
      journalEntryId: entry.id,
      accountId: l.accountId,
      debit: l.debit.toString(),
      credit: l.credit.toString(),
      description: l.description,
    }))
  );

  await logAudit("journal.create", "journal_entry", entry.id, {
    description: entryData.description,
    totalDebit,
    totalCredit,
    lineCount: lines.length,
  });

  const enriched = await getJournalWithLines(entry.id);
  res.status(201).json(GetJournalResponse.parse(serializeForZod(enriched)));
});

router.get("/journals/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const entry = await getJournalWithLines(id);
  if (!entry) { res.status(404).json({ error: "Journal entry not found" }); return; }
  res.json(GetJournalResponse.parse(serializeForZod(entry)));
});

router.delete("/journals/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const entry = await getJournalWithLines(id);
  if (!entry) { res.status(404).json({ error: "Journal entry not found" }); return; }

  // Cascade: delete associated business record based on journal type
  if (entry.type === "sale") {
    await db.delete(salesTable).where(eq(salesTable.journalEntryId, id));
  } else if (entry.type === "expense") {
    await db.delete(expensesTable).where(eq(expensesTable.journalEntryId, id));
  } else if (entry.type === "purchase") {
    const batch = await db.query.inventoryBatchesTable.findFirst({ where: eq(inventoryBatchesTable.journalEntryId, id) });
    if (batch) {
      await db.update(inventoryBatchesTable).set({ journalEntryId: null }).where(eq(inventoryBatchesTable.id, batch.id));
      await db.delete(inventoryBatchesTable).where(eq(inventoryBatchesTable.id, batch.id));
    }
  }

  await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, id));
  await logAudit("journal.delete", "journal_entry", id, {
    action: "delete journal entry",
    type: entry.type,
  }, "admin");
  res.json(DeleteJournalResponse.parse(serializeForZod(entry)));
});

export { getJournalWithLines };
export default router;
