import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { serializeForZod } from "../lib/serialize";
import { journalEntriesTable, journalLinesTable, accountsTable } from "@workspace/db";

const router = Router();

router.post("/capital/add", async (req, res): Promise<void> => {
  const { amount, cashAccountId, date, description } = req.body as Record<string, any>;

  if (!amount || amount <= 0) {
    res.status(400).json({ error: "Amount must be positive" });
    return;
  }
  if (!cashAccountId) {
    res.status(400).json({ error: "Cash account is required" });
    return;
  }

  const cashAccount = await db.query.accountsTable.findFirst({ where: eq(accountsTable.id, cashAccountId) });
  if (!cashAccount) {
    res.status(404).json({ error: "Cash account not found" });
    return;
  }

  // Find an equity account (type "equity") to credit
  const equityAccount = await db.query.accountsTable.findFirst({
    where: eq(accountsTable.type, "equity"),
  });
  if (!equityAccount) {
    res.status(400).json({ error: "No equity account found. Create an Owner's Equity account first." });
    return;
  }

  const txnDate = date ? String(date).slice(0, 10) : new Date().toISOString().slice(0, 10);

  const [entry] = await db.insert(journalEntriesTable).values({
    date: txnDate,
    description: description ?? "Owner capital contribution",
    type: "general",
  }).returning();

  await db.insert(journalLinesTable).values([
    {
      journalEntryId: entry.id,
      accountId: cashAccountId,
      debit: String(amount),
      credit: "0",
      description: "Capital injection",
    },
    {
      journalEntryId: entry.id,
      accountId: equityAccount.id,
      debit: "0",
      credit: String(amount),
      description: "Owner capital contribution",
    },
  ]);

  res.status(201).json(serializeForZod({
    id: entry.id,
    amount,
    cashAccountId,
    cashAccountName: cashAccount.name,
    equityAccountId: equityAccount.id,
    equityAccountName: equityAccount.name,
    date: txnDate,
    description: description ?? "Owner capital contribution",
  }));
});

export default router;