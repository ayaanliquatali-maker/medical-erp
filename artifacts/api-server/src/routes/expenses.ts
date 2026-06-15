import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireAdmin } from "../lib/admin";
import { logAudit } from "../lib/audit";
import { serializeForZod } from "../lib/serialize";
import { expensesTable, accountsTable, vendorsTable, journalEntriesTable, journalLinesTable } from "@workspace/db";
import {
  ListExpensesResponse,
  CreateExpenseBody,
  GetExpenseParams,
  GetExpenseResponse,
  DeleteExpenseParams,
  DeleteExpenseResponse,
} from "@workspace/api-zod";

const router = Router();

async function getExpenseEnriched(expenseId: number) {
  const expense = await db.query.expensesTable.findFirst({
    where: eq(expensesTable.id, expenseId),
  });
  if (!expense) return null;

  const [expAcc, payAcc, vendor] = await Promise.all([
    db.query.accountsTable.findFirst({ where: eq(accountsTable.id, expense.expenseAccountId) }),
    db.query.accountsTable.findFirst({ where: eq(accountsTable.id, expense.paymentAccountId) }),
    expense.vendorId ? db.query.vendorsTable.findFirst({ where: eq(vendorsTable.id, expense.vendorId) }) : null,
  ]);

  return {
    ...expense,
    amount: parseFloat(expense.amount as string),
    expenseAccountName: expAcc?.name ?? "",
    paymentAccountName: payAcc?.name ?? "",
    vendorName: vendor?.name ?? null,
  };
}

router.get("/expenses", async (req, res): Promise<void> => {
  let expenses = await db.select().from(expensesTable).orderBy(expensesTable.date);
  const { vendorId, accountId, from, to } = req.query as Record<string, string>;

  if (vendorId) expenses = expenses.filter(e => e.vendorId === parseInt(vendorId, 10));
  if (accountId) expenses = expenses.filter(e => e.expenseAccountId === parseInt(accountId, 10) || e.paymentAccountId === parseInt(accountId, 10));
  if (from) expenses = expenses.filter(e => e.date >= from);
  if (to) expenses = expenses.filter(e => e.date <= to);

  const enriched = await Promise.all(expenses.map(e => getExpenseEnriched(e.id)));
  res.json(ListExpensesResponse.parse(serializeForZod(enriched.filter(Boolean))));
});

router.post("/expenses", async (req, res): Promise<void> => {
  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;

  const [expAcc, payAcc] = await Promise.all([
    db.query.accountsTable.findFirst({ where: eq(accountsTable.id, data.expenseAccountId) }),
    db.query.accountsTable.findFirst({ where: eq(accountsTable.id, data.paymentAccountId) }),
  ]);

  if (!expAcc) { res.status(404).json({ error: "Expense account not found" }); return; }
  if (!payAcc) { res.status(404).json({ error: "Payment account not found" }); return; }

  const vendorName = data.vendorId
    ? (await db.query.vendorsTable.findFirst({ where: eq(vendorsTable.id, data.vendorId) }))?.name
    : undefined;

  const dateStr = data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date);

  // Cash balance check — reject if payment would overdraw the account
  const payAccountSum = await db
    .select({ debit: sql<string>`COALESCE(SUM(${journalLinesTable.debit}), 0)`, credit: sql<string>`COALESCE(SUM(${journalLinesTable.credit}), 0)` })
    .from(journalLinesTable)
    .where(eq(journalLinesTable.accountId, data.paymentAccountId));
  const payBal = parseFloat(payAccountSum[0]?.debit || "0") - parseFloat(payAccountSum[0]?.credit || "0");
  if (payBal < data.amount) {
    res.status(400).json({ error: `Insufficient cash in payment account. Need ${data.amount.toFixed(2)}, but only ${Math.max(0, payBal).toFixed(2)} available. Add capital (owner equity) first.` });
    return;
  }

  // Create journal entry: DR Expense Account, CR Payment Account
  const [journalEntry] = await db.insert(journalEntriesTable).values({
    date: dateStr,
    description: `Expense: ${data.description}${vendorName ? ` (${vendorName})` : ""}`,
    reference: data.reference,
    type: "expense",
  }).returning();

  await db.insert(journalLinesTable).values([
    { journalEntryId: journalEntry.id, accountId: data.expenseAccountId, debit: data.amount.toString(), credit: "0", description: data.description },
    { journalEntryId: journalEntry.id, accountId: data.paymentAccountId, debit: "0", credit: data.amount.toString(), description: data.description },
  ]);

  const [expense] = await db.insert(expensesTable).values({
    date: dateStr,
    amount: data.amount.toString(),
    description: data.description,
    expenseAccountId: data.expenseAccountId,
    paymentAccountId: data.paymentAccountId,
    vendorId: data.vendorId,
    reference: data.reference,
    journalEntryId: journalEntry.id,
  }).returning();

  await logAudit("expense.create", "expense", expense.id, {
    amount: data.amount,
    description: data.description,
    expenseAccountId: data.expenseAccountId,
  });

  const enriched = await getExpenseEnriched(expense.id);
  res.status(201).json(GetExpenseResponse.parse(serializeForZod(enriched)));
});

router.get("/expenses/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const expense = await getExpenseEnriched(id);
  if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }
  res.json(GetExpenseResponse.parse(serializeForZod(expense)));
});

router.delete("/expenses/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const expense = await getExpenseEnriched(id);
  if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }
  if (expense.journalEntryId) {
    await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, expense.journalEntryId));
  }
  await db.delete(expensesTable).where(eq(expensesTable.id, id));
  await logAudit("expense.delete", "expense", id, { action: "delete expense" }, "admin");
  res.json(DeleteExpenseResponse.parse(serializeForZod(expense)));
});

export default router;
