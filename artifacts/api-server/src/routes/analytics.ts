import { Router } from "express";
import { eq, sql, and, gte, lte, desc, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { serializeForZod } from "../lib/serialize";
import {
  salesTable,
  saleLinesTable,
  expensesTable,
  productsTable,
  accountsTable,
  journalEntriesTable,
  journalLinesTable,
  inventoryBatchesTable,
} from "@workspace/db";
import {
  GetDashboardStatsResponse,
  GetCashflowResponse,
  GetRevenueAnalyticsResponse,
  GetTopProductsResponse,
  GetExpenseAnalyticsResponse,
  GetReceivablesPayablesResponse,
  GetIncomeStatementResponse,
  GetBalanceSheetResponse,
  GetBestPeriodsResponse,
} from "@workspace/api-zod";

const router = Router();

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function sortPeriodLabels(labels: string[]): string[] {
  return labels.sort((a, b) => {
    // Monthly: "Mon YYYY"
    const mA = a.match(/^(\w{3})\s+(\d{4})$/);
    const mB = b.match(/^(\w{3})\s+(\d{4})$/);
    if (mA && mB) {
      const ka = mA[2] + String(MONTH_NAMES.indexOf(mA[1])).padStart(2, "0");
      const kb = mB[2] + String(MONTH_NAMES.indexOf(mB[1])).padStart(2, "0");
      return ka.localeCompare(kb);
    }
    // Quarterly: "QN YYYY"
    const qA = a.match(/^Q(\d)\s+(\d{4})$/);
    const qB = b.match(/^Q(\d)\s+(\d{4})$/);
    if (qA && qB) {
      const ka = qA[2] + qA[1].padStart(2, "0");
      const kb = qB[2] + qB[1].padStart(2, "0");
      return ka.localeCompare(kb);
    }
    // Yearly
    const yA = parseInt(a, 10);
    const yB = parseInt(b, 10);
    if (!isNaN(yA) && !isNaN(yB)) return yA - yB;
    // Daily: "D Mon YYYY"
    const dA = a.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/);
    const dB = b.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/);
    if (dA && dB) {
      const ka = dA[3] + String(MONTH_NAMES.indexOf(dA[2])).padStart(2, "0") + dA[1].padStart(2, "0");
      const kb = dB[3] + String(MONTH_NAMES.indexOf(dB[2])).padStart(2, "0") + dB[1].padStart(2, "0");
      return ka.localeCompare(kb);
    }
    return a.localeCompare(b);
  });
}

function getPeriodLabel(date: string, period: string): string {
  const parts = date.split("-").map(Number);
  const y = parts[0];
  const m = parts[1] - 1; // 0-indexed month
  const dayNum = parts[2];
  if (period === "daily") {
    return `${dayNum} ${MONTH_NAMES[m]} ${y}`;
  }
  if (period === "yearly") return y.toString();
  if (period === "quarterly") {
    const q = Math.floor(m / 3) + 1;
    return `Q${q} ${y}`;
  }
  return `${MONTH_NAMES[m]} ${y}`;
}

function groupByPeriod(items: { date: string; amount: number }[], period: string): { label: string; value: number }[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const label = getPeriodLabel(item.date, period);
    map.set(label, (map.get(label) ?? 0) + item.amount);
  }
  return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
}

async function getAccountBalance(accountId: number): Promise<number> {
  const rows = await db
    .select({
      debit: sql<string>`COALESCE(SUM(${journalLinesTable.debit}), 0)`,
      credit: sql<string>`COALESCE(SUM(${journalLinesTable.credit}), 0)`,
    })
    .from(journalLinesTable)
    .where(eq(journalLinesTable.accountId, accountId));
  return parseFloat(rows[0]?.debit || "0") - parseFloat(rows[0]?.credit || "0");
}

// ── GL-based financial helpers ──

/** All journal lines with account codes and entry dates */
async function getJournalLinesWithAccounts() {
  return db
    .select({
      date: journalEntriesTable.date,
      code: accountsTable.code,
      debit: sql<string>`${journalLinesTable.debit}`,
      credit: sql<string>`${journalLinesTable.credit}`,
    })
    .from(journalLinesTable)
    .innerJoin(journalEntriesTable, eq(journalLinesTable.journalEntryId, journalEntriesTable.id))
    .innerJoin(accountsTable, eq(journalLinesTable.accountId, accountsTable.id));
}

function codeStarts(code: string, prefix: string) {
  return code != null && code.startsWith(prefix);
}

type GLRow = { date: string; code: string; debit: string; credit: string };

function revenueFromGL(rows: GLRow[]) {
  return rows
    .filter(r => codeStarts(r.code, "4"))
    .reduce((s, r) => s + parseFloat(r.credit || "0") - parseFloat(r.debit || "0"), 0);
}

function cogsFromGL(rows: GLRow[]) {
  return rows
    .filter(r => r.code === "5000")
    .reduce((s, r) => s + parseFloat(r.debit || "0") - parseFloat(r.credit || "0"), 0);
}

function expensesFromGL(rows: GLRow[]) {
  return rows
    .filter(r => codeStarts(r.code, "5") && r.code !== "5000")
    .reduce((s, r) => s + parseFloat(r.debit || "0") - parseFloat(r.credit || "0"), 0);
}

function cashInflowFromGL(rows: GLRow[]) {
  // Debits to cash/bank accounts = money coming in
  return rows
    .filter(r => (r.code === "1000" || r.code === "1100"))
    .reduce((s, r) => s + parseFloat(r.debit || "0") - parseFloat(r.credit || "0"), 0);
}

async function getGLFinancials(filter?: (r: GLRow) => boolean) {
  const allRows = await getJournalLinesWithAccounts();
  const rows = filter ? allRows.filter(filter) : allRows;
  return {
    revenue: revenueFromGL(rows),
    cogs: cogsFromGL(rows),
    expenses: expensesFromGL(rows),
    grossProfit: revenueFromGL(rows) - cogsFromGL(rows),
    netProfit: revenueFromGL(rows) - cogsFromGL(rows) - expensesFromGL(rows),
  };
}

router.get("/analytics/dashboard", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10);
  const thisYear = new Date().getFullYear().toString();

  // Financials from GL
  const allRows = await getJournalLinesWithAccounts();
  const todayRows = allRows.filter(r => r.date === today);
  const totalRevenue = revenueFromGL(allRows);
  const totalOpex = expensesFromGL(allRows);
  const totalCOGS = cogsFromGL(allRows);
  const netProfit = totalRevenue - totalCOGS - totalOpex;
  const todaySales = revenueFromGL(todayRows);

  // Product / inventory / sales stats still from business tables
  const [allSales, allProducts, allBatches] = await Promise.all([
    db.select().from(salesTable),
    db.select().from(productsTable).where(eq(productsTable.isActive, true)),
    db.select().from(inventoryBatchesTable),
  ]);

  const in30Days = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  let lowStockCount = 0;
  let nearExpiryCount = 0;

  for (const product of allProducts) {
    const productBatches = allBatches.filter(b => b.productId === product.id);
    const totalTablets = productBatches.reduce((sum, b) => sum + b.remainingTablets, 0);
    if (totalTablets <= product.reorderLevel) lowStockCount++;
    const nearExpiry = productBatches.filter(b => b.remainingTablets > 0 && b.expiryDate <= in30Days);
    if (nearExpiry.length > 0) nearExpiryCount++;
  }

  // Monthly sales trend (last 12 months)
  const monthlySalesTrend = groupByPeriod(
    allSales.map(s => ({ date: s.date, amount: parseFloat(s.total as string) })),
    "monthly"
  ).slice(-12);

  // Recent sales (last 5)
  const recentSalesRows = allSales
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5);

  // Top products by revenue from sale lines
  const allLines = await db
    .select({
      productId: saleLinesTable.productId,
      productName: productsTable.name,
      quantity: saleLinesTable.quantity,
      total: saleLinesTable.total,
    })
    .from(saleLinesTable)
    .innerJoin(productsTable, eq(saleLinesTable.productId, productsTable.id));

  const productMap = new Map<number, { productId: number; productName: string; quantity: number; revenue: number }>();
  for (const line of allLines) {
    const pid = line.productId;
    const existing = productMap.get(pid) ?? { productId: pid, productName: line.productName, quantity: 0, revenue: 0 };
    existing.quantity += parseFloat(line.quantity as string);
    existing.revenue += parseFloat(line.total as string);
    productMap.set(pid, existing);
  }
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const recentSalesEnriched = await Promise.all(recentSalesRows.map(async s => {
    const lines = await db
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
      .where(eq(saleLinesTable.saleId, s.id));

    const paymentAcc = await db.query.accountsTable.findFirst({ where: eq(accountsTable.id, s.paymentAccountId) });

    return {
      ...s,
      subtotal: parseFloat(s.subtotal as string),
      discount: parseFloat(s.discount as string),
      total: parseFloat(s.total as string),
      paymentAccountName: paymentAcc?.name ?? "",
      lines: lines.map(l => ({
        ...l,
        quantity: parseFloat(l.quantity as string),
        unitPrice: parseFloat(l.unitPrice as string),
        discount: parseFloat(l.discount as string),
        total: parseFloat(l.total as string),
      })),
    };
  }));

  res.json(GetDashboardStatsResponse.parse(serializeForZod({
    totalRevenue,
    totalExpenses: totalOpex,
    netProfit,
    todaySales,
    totalProducts: allProducts.length,
    lowStockCount,
    nearExpiryCount,
    monthlySalesTrend,
    recentSales: recentSalesEnriched,
    topProducts,
  })));
});

router.get("/analytics/cashflow", async (req, res): Promise<void> => {
  const { period = "monthly", year, month, quarter, day } = req.query as Record<string, string>;

  const allRows = await getJournalLinesWithAccounts();

  // Filter by date range
  const dateFilter = (r: GLRow) => {
    if (year && !r.date.startsWith(year)) return false;
    if (month) {
      const mm = String(parseInt(month, 10)).padStart(2, "0");
      if (!r.date.slice(5, 7).startsWith(mm)) return false;
    }
    if (day) {
      const dd = String(parseInt(day, 10)).padStart(2, "0");
      if (!r.date.slice(8, 10).startsWith(dd)) return false;
    }
    if (quarter) {
      const q = parseInt(quarter, 10);
      const m = parseInt(r.date.slice(5, 7), 10);
      const startMonth = (q - 1) * 3 + 1;
      const endMonth = startMonth + 2;
      if (m < startMonth || m > endMonth) return false;
    }
    return true;
  };
  const filteredRows = allRows.filter(dateFilter);

  // Inflow: debits to cash/bank accounts (1000, 1100) from sales/revenue
  // Outflow: credits to cash/bank accounts from expenses/purchases
  const inflowMap = new Map<string, number>();
  const outflowMap = new Map<string, number>();

  for (const r of filteredRows) {
    if (r.code !== "1000" && r.code !== "1100") continue;
    const label = getPeriodLabel(r.date, period);
    const debit = parseFloat(r.debit || "0");
    const credit = parseFloat(r.credit || "0");
    if (debit > credit) {
      inflowMap.set(label, (inflowMap.get(label) ?? 0) + debit - credit);
    } else {
      outflowMap.set(label, (outflowMap.get(label) ?? 0) + credit - debit);
    }
  }

  const allLabels = sortPeriodLabels([...new Set([...inflowMap.keys(), ...outflowMap.keys()])]);
  const periods = allLabels.map(label => ({
    label,
    inflow: inflowMap.get(label) ?? 0,
    outflow: outflowMap.get(label) ?? 0,
    net: (inflowMap.get(label) ?? 0) - (outflowMap.get(label) ?? 0),
  }));

  const totalInflow = filteredRows
    .filter(r => r.code === "1000" || r.code === "1100")
    .reduce((s, r) => s + Math.max(0, parseFloat(r.debit || "0") - parseFloat(r.credit || "0")), 0);
  const totalOutflow = filteredRows
    .filter(r => r.code === "1000" || r.code === "1100")
    .reduce((s, r) => s + Math.max(0, parseFloat(r.credit || "0") - parseFloat(r.debit || "0")), 0);

  res.json(GetCashflowResponse.parse(serializeForZod({ periods, totalInflow, totalOutflow, netCashflow: totalInflow - totalOutflow })));
});

router.get("/analytics/revenue", async (req, res): Promise<void> => {
  const { period = "monthly", year } = req.query as Record<string, string>;
  const allRows = await getJournalLinesWithAccounts();
  const revenueRows = allRows.filter(r => codeStarts(r.code, "4") && (!year || r.date.startsWith(year)));

  const periods = groupByPeriod(
    revenueRows.map(r => ({ date: r.date, amount: parseFloat(r.credit || "0") - parseFloat(r.debit || "0") })),
    period
  );

  // Product detail still from sale_lines
  const allLines = await db
    .select({
      productId: saleLinesTable.productId,
      productName: productsTable.name,
      quantity: saleLinesTable.quantity,
      total: saleLinesTable.total,
      date: salesTable.date,
    })
    .from(saleLinesTable)
    .innerJoin(productsTable, eq(saleLinesTable.productId, productsTable.id))
    .innerJoin(salesTable, eq(saleLinesTable.saleId, salesTable.id));

  const filteredLines = year ? allLines.filter(l => l.date.startsWith(year)) : allLines;

  const productMap = new Map<number, { productId: number; productName: string; quantity: number; revenue: number }>();
  for (const line of filteredLines) {
    const pid = line.productId;
    const existing = productMap.get(pid) ?? { productId: pid, productName: line.productName, quantity: 0, revenue: 0 };
    existing.quantity += parseFloat(line.quantity as string);
    existing.revenue += parseFloat(line.total as string);
    productMap.set(pid, existing);
  }
  const byProduct = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue);
  const totalRevenue = revenueFromGL(revenueRows);

  res.json(GetRevenueAnalyticsResponse.parse(serializeForZod({ periods, byProduct, totalRevenue })));
});

router.get("/analytics/top-products", async (req, res): Promise<void> => {
  const { period = "monthly", year, limit = "10" } = req.query as Record<string, string>;
  const lim = parseInt(limit, 10) || 10;

  const allLines = await db
    .select({
      productId: saleLinesTable.productId,
      productName: productsTable.name,
      quantity: saleLinesTable.quantity,
      total: saleLinesTable.total,
      date: salesTable.date,
    })
    .from(saleLinesTable)
    .innerJoin(productsTable, eq(saleLinesTable.productId, productsTable.id))
    .innerJoin(salesTable, eq(saleLinesTable.saleId, salesTable.id));

  const filteredLines = year ? allLines.filter(l => l.date.startsWith(year)) : allLines;

  const productMap = new Map<number, { productId: number; productName: string; quantity: number; revenue: number }>();
  for (const line of filteredLines) {
    const pid = line.productId;
    const existing = productMap.get(pid) ?? { productId: pid, productName: line.productName, quantity: 0, revenue: 0 };
    existing.quantity += parseFloat(line.quantity as string);
    existing.revenue += parseFloat(line.total as string);
    productMap.set(pid, existing);
  }

  const sorted = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue);
  const topSelling = sorted.slice(0, lim);
  const slowMoving = sorted.slice(-Math.min(lim, sorted.length)).reverse();

  // top purchased: from inventory batches
  const allBatches = await db
    .select({
      productId: inventoryBatchesTable.productId,
      productName: productsTable.name,
      total: inventoryBatchesTable.totalTablets,
    })
    .from(inventoryBatchesTable)
    .innerJoin(productsTable, eq(inventoryBatchesTable.productId, productsTable.id));

  const purchaseMap = new Map<number, { productId: number; productName: string; quantity: number; revenue: number }>();
  for (const b of allBatches) {
    const pid = b.productId;
    const existing = purchaseMap.get(pid) ?? { productId: pid, productName: b.productName, quantity: 0, revenue: 0 };
    existing.quantity += b.total;
    purchaseMap.set(pid, existing);
  }
  const topPurchased = Array.from(purchaseMap.values()).sort((a, b) => b.quantity - a.quantity).slice(0, lim);

  res.json(GetTopProductsResponse.parse(serializeForZod({ topSelling, topPurchased, slowMoving })));
});

router.get("/analytics/expenses", async (req, res): Promise<void> => {
  const { period = "monthly", year } = req.query as Record<string, string>;
  const allRows = await getJournalLinesWithAccounts();
  const expenseRows = allRows.filter(r => codeStarts(r.code, "5") && r.code !== "5000" && (!year || r.date.startsWith(year)));

  const periods = groupByPeriod(
    expenseRows.map(r => ({ date: r.date, amount: parseFloat(r.debit || "0") - parseFloat(r.credit || "0") })),
    period
  );

  // By account — from expense table (still needed for vendor/account detail)
  let expenses = await db.select().from(expensesTable);
  if (year) expenses = expenses.filter(e => e.date.startsWith(year));
  const accountMap = new Map<number, { accountId: number; accountName: string; amount: number }>();
  for (const e of expenses) {
    const acc = await db.query.accountsTable.findFirst({ where: eq(accountsTable.id, e.expenseAccountId) });
    const name = acc?.name ?? "Unknown";
    const existing = accountMap.get(e.expenseAccountId) ?? { accountId: e.expenseAccountId, accountName: name, amount: 0 };
    existing.amount += parseFloat(e.amount as string);
    accountMap.set(e.expenseAccountId, existing);
  }

  // By vendor
  const vendorMap = new Map<number, { vendorId: number; vendorName: string; amount: number }>();
  for (const e of expenses) {
    if (!e.vendorId) continue;
    const existing = vendorMap.get(e.vendorId) ?? { vendorId: e.vendorId, vendorName: "", amount: 0 };
    existing.amount += parseFloat(e.amount as string);
    vendorMap.set(e.vendorId, existing);
  }

  const totalExpenses = expensesFromGL(expenseRows);

  res.json(GetExpenseAnalyticsResponse.parse(serializeForZod({
    periods,
    byAccount: Array.from(accountMap.values()),
    byVendor: Array.from(vendorMap.values()),
    totalExpenses,
  })));
});

router.get("/analytics/receivables-payables", async (_req, res): Promise<void> => {
  const accounts = await db.select().from(accountsTable);

  const receivableAccounts = accounts.filter(a => a.type === "asset" && a.name.toLowerCase().includes("receivable"));
  const payableAccounts = accounts.filter(a => a.type === "liability" && a.name.toLowerCase().includes("payable"));

  const receivablesByAccount = await Promise.all(
    receivableAccounts.map(async a => ({ accountId: a.id, accountName: a.name, amount: Math.max(0, await getAccountBalance(a.id)) }))
  );
  const payablesByAccount = await Promise.all(
    payableAccounts.map(async a => ({ accountId: a.id, accountName: a.name, amount: Math.abs(Math.min(0, await getAccountBalance(a.id))) }))
  );

  res.json(GetReceivablesPayablesResponse.parse(serializeForZod({
    totalReceivables: receivablesByAccount.reduce((s, a) => s + a.amount, 0),
    totalPayables: payablesByAccount.reduce((s, a) => s + a.amount, 0),
    receivablesByAccount,
    payablesByAccount,
  })));
});

router.get("/analytics/income-statement", async (req, res): Promise<void> => {
  const { period = "monthly", year, month, quarter, day } = req.query as Record<string, string>;

  const allRows = await getJournalLinesWithAccounts();

  // Filter by date range
  const dateFilter = (r: GLRow) => {
    if (year && !r.date.startsWith(year)) return false;
    if (month) {
      const mm = String(parseInt(month, 10)).padStart(2, "0");
      if (!r.date.slice(5, 7).startsWith(mm)) return false;
    }
    if (day) {
      const dd = String(parseInt(day, 10)).padStart(2, "0");
      if (!r.date.slice(8, 10).startsWith(dd)) return false;
    }
    if (quarter) {
      const q = parseInt(quarter, 10);
      const m = parseInt(r.date.slice(5, 7), 10);
      const startMonth = (q - 1) * 3 + 1;
      const endMonth = startMonth + 2;
      if (m < startMonth || m > endMonth) return false;
    }
    return true;
  };
  const filteredRows = allRows.filter(dateFilter);

  const revenueByPeriod = new Map<string, number>();
  const cogsByPeriod = new Map<string, number>();
  const expenseByPeriod = new Map<string, number>();

  for (const r of filteredRows) {
    const label = getPeriodLabel(r.date, period);
    const debit = parseFloat(r.debit || "0");
    const credit = parseFloat(r.credit || "0");
    if (codeStarts(r.code, "4")) {
      // Revenue accounts: credit - debit = revenue
      revenueByPeriod.set(label, (revenueByPeriod.get(label) ?? 0) + credit - debit);
    } else if (r.code === "5000") {
      // COGS account: debit - credit = cost
      cogsByPeriod.set(label, (cogsByPeriod.get(label) ?? 0) + debit - credit);
    } else if (codeStarts(r.code, "5") && r.code !== "5000") {
      // Other expense accounts: debit - credit = expense
      expenseByPeriod.set(label, (expenseByPeriod.get(label) ?? 0) + debit - credit);
    }
  }

  const allLabels = sortPeriodLabels([...new Set([...revenueByPeriod.keys(), ...cogsByPeriod.keys(), ...expenseByPeriod.keys()])]);
  const revenue = revenueFromGL(filteredRows);
  const totalCOGS = cogsFromGL(filteredRows);
  const totalOpex = expensesFromGL(filteredRows);
  const grossProfit = revenue - totalCOGS;
  const netProfit = grossProfit - totalOpex;

  const periods = allLabels.map(label => ({
    label,
    revenue: revenueByPeriod.get(label) ?? 0,
    expenses: expenseByPeriod.get(label) ?? 0,
    cogs: cogsByPeriod.get(label) ?? 0,
    profit: (revenueByPeriod.get(label) ?? 0) - (cogsByPeriod.get(label) ?? 0) - (expenseByPeriod.get(label) ?? 0),
  }));

  res.json(GetIncomeStatementResponse.parse(serializeForZod({
    periods,
    revenue,
    expenses: totalOpex,
    grossProfit,
    netProfit,
  })));
});

router.get("/analytics/balance-sheet", async (req, res): Promise<void> => {
  const accounts = await db.select().from(accountsTable);

  const asOf = (req.query.asOf as string) ?? new Date().toISOString().slice(0, 10);

  const getBalWithName = async (account: typeof accounts[0]) => ({
    accountId: account.id,
    accountName: account.name,
    amount: Math.abs(await getAccountBalance(account.id)),
  });

  const assets = await Promise.all(accounts.filter(a => a.type === "asset").map(getBalWithName));
  const liabilities = await Promise.all(accounts.filter(a => a.type === "liability").map(getBalWithName));
  const equity = await Promise.all(accounts.filter(a => a.type === "equity").map(getBalWithName));

  // Compute retained earnings = cumulative net profit up to asOf date
  const allRows = await getJournalLinesWithAccounts();
  const rowsUpTo = allRows.filter(r => r.date <= asOf);
  const revenue = revenueFromGL(rowsUpTo);
  const cogs = cogsFromGL(rowsUpTo);
  const opex = expensesFromGL(rowsUpTo);
  const retainedEarnings = revenue - cogs - opex;

  const retainedItem = { accountId: 0, accountName: "Retained Earnings", amount: Math.abs(retainedEarnings) };
  if (retainedEarnings >= 0) {
    equity.push(retainedItem);
  } else {
    // Negative retained earnings (accumulated loss) goes as negative equity or as a contra-equity
    equity.push({ ...retainedItem, accountName: "Accumulated Loss" });
  }

  const totalEquityVal = equity.reduce((s, a) => s + a.amount, 0);
  const totalAssetsVal = assets.reduce((s, a) => s + a.amount, 0);
  const totalLiabilitiesVal = liabilities.reduce((s, a) => s + a.amount, 0);
  const totalLiabilitiesEquity = totalLiabilitiesVal + totalEquityVal;
  const difference = totalAssetsVal - totalLiabilitiesEquity;

  res.json(GetBalanceSheetResponse.parse(serializeForZod({
    assets,
    liabilities,
    equity,
    totalAssets: totalAssetsVal,
    totalLiabilities: totalLiabilitiesVal,
    totalEquity: totalEquityVal,
    totalLiabilitiesEquity,
    difference,
  })));
});

router.get("/analytics/best-periods", async (_req, res): Promise<void> => {
  const allRows = await getJournalLinesWithAccounts();
  const revenueRows = allRows.filter(r => codeStarts(r.code, "4"));

  const monthlyMap = new Map<string, number>();
  const quarterlyMap = new Map<string, number>();
  const yearlyMap = new Map<string, number>();

  for (const r of revenueRows) {
    const amount = parseFloat(r.credit || "0") - parseFloat(r.debit || "0");
    if (amount <= 0) continue;
    const mLabel = getPeriodLabel(r.date, "monthly");
    const qLabel = getPeriodLabel(r.date, "quarterly");
    const yLabel = getPeriodLabel(r.date, "yearly");
    monthlyMap.set(mLabel, (monthlyMap.get(mLabel) ?? 0) + amount);
    quarterlyMap.set(qLabel, (quarterlyMap.get(qLabel) ?? 0) + amount);
    yearlyMap.set(yLabel, (yearlyMap.get(yLabel) ?? 0) + amount);
  }

  const topMonths = Array.from(monthlyMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value]) => ({ label, value }));

  const topQuarters = Array.from(quarterlyMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, value]) => ({ label, value }));

  const bestMonth = topMonths[0] ? { label: topMonths[0].label, revenue: topMonths[0].value } : { label: "N/A", revenue: 0 };
  const bestQuarter = topQuarters[0] ? { label: topQuarters[0].label, revenue: topQuarters[0].value } : { label: "N/A", revenue: 0 };

  const yearEntries = Array.from(yearlyMap.entries()).sort((a, b) => b[1] - a[1]);
  const bestYear = yearEntries[0] ? { label: yearEntries[0][0], revenue: yearEntries[0][1] } : { label: "N/A", revenue: 0 };

  res.json(GetBestPeriodsResponse.parse(serializeForZod({ bestMonth, bestQuarter, bestYear, topMonths, topQuarters })));
});

export default router;
