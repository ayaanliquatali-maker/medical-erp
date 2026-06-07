import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { serializeForZod } from "../lib/serialize";
import { accountsTable, journalLinesTable, journalEntriesTable } from "@workspace/db";
import {
  ListAccountsResponse,
  CreateAccountBody,
  GetAccountParams,
  GetAccountResponse,
  UpdateAccountParams,
  UpdateAccountBody,
  UpdateAccountResponse,
  DeleteAccountParams,
  DeleteAccountResponse,
  GetAccountBalanceResponse,
} from "@workspace/api-zod";

const router = Router();

async function getAccountBalance(accountId: number): Promise<number> {
  const rows = await db
    .select({
      debit: sql<string>`COALESCE(SUM(${journalLinesTable.debit}), 0)`,
      credit: sql<string>`COALESCE(SUM(${journalLinesTable.credit}), 0)`,
    })
    .from(journalLinesTable)
    .where(eq(journalLinesTable.accountId, accountId));

  const debit = parseFloat(rows[0]?.debit || "0");
  const credit = parseFloat(rows[0]?.credit || "0");
  return debit - credit;
}

async function enrichAccount(account: typeof accountsTable.$inferSelect) {
  const balance = await getAccountBalance(account.id);
  const parentName = account.parentId
    ? (await db.query.accountsTable.findFirst({ where: eq(accountsTable.id, account.parentId) }))?.name ?? null
    : null;
  return { ...account, balance, parentName, children: [] };
}

router.get("/accounts", async (req, res): Promise<void> => {
  let query = db.select().from(accountsTable);
  const accounts = await query;

  const enriched = await Promise.all(accounts.map(enrichAccount));

  const accountMap = new Map(enriched.map(a => [a.id, { ...a, children: [] as typeof enriched }]));
  const roots: typeof enriched = [];

  for (const acc of enriched) {
    if (acc.parentId && accountMap.has(acc.parentId)) {
      accountMap.get(acc.parentId)!.children.push(acc as any);
    } else {
      roots.push(acc as any);
    }
  }

  res.json(ListAccountsResponse.parse(serializeForZod(roots)));
});

router.post("/accounts", async (req, res): Promise<void> => {
  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [account] = await db.insert(accountsTable).values(parsed.data as any).returning();
  const enriched = await enrichAccount(account);
  res.status(201).json(GetAccountResponse.parse(serializeForZod({ ...enriched, children: [] })));
});

router.get("/accounts/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const account = await db.query.accountsTable.findFirst({ where: eq(accountsTable.id, id) });
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  const enriched = await enrichAccount(account);
  res.json(GetAccountResponse.parse(serializeForZod({ ...enriched, children: [] })));
});

router.patch("/accounts/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const account = await db.query.accountsTable.findFirst({ where: eq(accountsTable.id, id) });
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  if (account.isSystem) { res.status(403).json({ error: "Cannot modify system account" }); return; }

  const parsed = UpdateAccountBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [updated] = await db.update(accountsTable)
    .set({ ...parsed.data as any, updatedAt: new Date() })
    .where(eq(accountsTable.id, id))
    .returning();

  const enriched = await enrichAccount(updated);
  res.json(UpdateAccountResponse.parse(serializeForZod({ ...enriched, children: [] })));
});

router.delete("/accounts/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const account = await db.query.accountsTable.findFirst({ where: eq(accountsTable.id, id) });
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  if (account.isSystem) { res.status(403).json({ error: "Cannot delete system account" }); return; }

  const lines = await db.select().from(journalLinesTable).where(eq(journalLinesTable.accountId, id));
  if (lines.length > 0) {
    res.status(400).json({ error: "Cannot delete account with journal entries" });
    return;
  }

  const [deleted] = await db.delete(accountsTable).where(eq(accountsTable.id, id)).returning();
  const enriched = await enrichAccount(deleted);
  res.json(DeleteAccountResponse.parse(serializeForZod({ ...enriched, children: [] })));
});

router.get("/accounts/:id/balance", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const account = await db.query.accountsTable.findFirst({ where: eq(accountsTable.id, id) });
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }

  const lines = await db
    .select({
      id: journalLinesTable.id,
      journalEntryId: journalLinesTable.journalEntryId,
      debit: journalLinesTable.debit,
      credit: journalLinesTable.credit,
      description: journalLinesTable.description,
      date: journalEntriesTable.date,
      entryDesc: journalEntriesTable.description,
      reference: journalEntriesTable.reference,
    })
    .from(journalLinesTable)
    .innerJoin(journalEntriesTable, eq(journalLinesTable.journalEntryId, journalEntriesTable.id))
    .where(eq(journalLinesTable.accountId, id))
    .orderBy(journalEntriesTable.date);

  let runningBalance = 0;
  const transactions = lines.map(line => {
    const debit = parseFloat(line.debit as string);
    const credit = parseFloat(line.credit as string);
    runningBalance += debit - credit;
    return {
      id: line.id,
      date: line.date,
      description: line.description || line.entryDesc,
      reference: line.reference,
      debit,
      credit,
      balance: runningBalance,
    };
  });

  const totalDebits = lines.reduce((s, l) => s + parseFloat(l.debit as string), 0);
  const totalCredits = lines.reduce((s, l) => s + parseFloat(l.credit as string), 0);

  res.json(GetAccountBalanceResponse.parse(serializeForZod({
    accountId: id,
    accountName: account.name,
    balance: totalDebits - totalCredits,
    debits: totalDebits,
    credits: totalCredits,
    transactions,
  })));
});

export default router;
