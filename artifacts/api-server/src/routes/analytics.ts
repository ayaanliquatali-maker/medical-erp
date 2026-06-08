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

function getPeriodLabel(date: string, period: string): string {
  const d = new Date(date);
  const month = d.getMonth();
  const year = d.getFullYear();
  if (period === "yearly") return year.toString();
  if (period === "quarterly") {
    const q = Math.floor(month / 3) + 1;
    return `Q${q} ${year}`;
  }
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[month]} ${year}`;
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

router.get("/analytics/dashboard", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10);
  const thisYear = new Date().getFullYear().toString();

  const [allSales, todaySalesRows, allExpenses, allProducts, allBatches] = await Promise.all([
    db.select().from(salesTable),
    db.select().from(salesTable).where(eq(salesTable.date, today)),
    db.select().from(expensesTable),
    db.select().from(productsTable).where(eq(productsTable.isActive, true)),
    db.select().from(inventoryBatchesTable),
  ]);

  const totalRevenue = allSales.reduce((s, r) => s + parseFloat(r.total as string), 0);
  const totalExpenses = allExpenses.reduce((s, r) => s + parseFloat(r.amount as string), 0);
  const netProfit = totalRevenue - totalExpenses;
  const todaySales = todaySalesRows.reduce((s, r) => s + parseFloat(r.total as string), 0);

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
    totalExpenses,
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
  const { period = "monthly", year, month, quarter } = req.query as Record<string, string>;
  const [allSales, allExpenses, allBatches] = await Promise.all([
    db.select().from(salesTable),
    db.select().from(expensesTable),
    db.select().from(inventoryBatchesTable),
  ]);

  let sales = allSales;
  let expenses = allExpenses;
  let batches = allBatches;
  if (year) {
    sales = sales.filter(s => s.date.startsWith(year));
    expenses = expenses.filter(e => e.date.startsWith(year));
    batches = batches.filter(b => b.receivedAt.getFullYear().toString() === year);
  }
  if (month) {
    const mm = String(parseInt(month, 10)).padStart(2, "0");
    if (year) {
      const prefix = `${year}-${mm}`;
      sales = sales.filter(s => s.date.startsWith(prefix));
      expenses = expenses.filter(e => e.date.startsWith(prefix));
      batches = batches.filter(b => b.receivedAt.toISOString().startsWith(prefix));
    } else {
      sales = sales.filter(s => s.date.slice(5, 7) === mm);
      expenses = expenses.filter(e => e.date.slice(5, 7) === mm);
      batches = batches.filter(b => String(b.receivedAt.getMonth() + 1).padStart(2, "0") === mm);
    }
  }
  if (quarter) {
    const q = parseInt(quarter, 10);
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const inRange = (dateStr: string) => {
      const m = parseInt(dateStr.slice(5, 7), 10);
      return m >= startMonth && m <= endMonth;
    };
    sales = sales.filter(s => inRange(s.date));
    expenses = expenses.filter(e => inRange(e.date));
    batches = batches.filter(b => {
      const m = b.receivedAt.getMonth() + 1;
      return m >= startMonth && m <= endMonth;
    });
  }

  const inflowMap = new Map<string, number>();
  const outflowMap = new Map<string, number>();

  for (const s of sales) {
    const label = getPeriodLabel(s.date, period);
    inflowMap.set(label, (inflowMap.get(label) ?? 0) + parseFloat(s.total as string));
  }
  for (const e of expenses) {
    const label = getPeriodLabel(e.date, period);
    outflowMap.set(label, (outflowMap.get(label) ?? 0) + parseFloat(e.amount as string));
  }
  // Include inventory purchases as cash outflow
  for (const b of batches) {
    const dateStr = b.receivedAt.toISOString().slice(0, 10);
    const cost = b.totalTablets * parseFloat(b.costPerUnit as string);
    const label = getPeriodLabel(dateStr, period);
    outflowMap.set(label, (outflowMap.get(label) ?? 0) + cost);
  }

  const allLabels = [...new Set([...inflowMap.keys(), ...outflowMap.keys()])].sort();
  const periods = allLabels.map(label => ({
    label,
    inflow: inflowMap.get(label) ?? 0,
    outflow: outflowMap.get(label) ?? 0,
    net: (inflowMap.get(label) ?? 0) - (outflowMap.get(label) ?? 0),
  }));

  const totalInflow = sales.reduce((s, r) => s + parseFloat(r.total as string), 0);
  const totalExpenseOutflow = expenses.reduce((s, r) => s + parseFloat(r.amount as string), 0);
  const totalInventoryOutflow = batches.reduce((s, b) => s + b.totalTablets * parseFloat(b.costPerUnit as string), 0);
  const totalOutflow = totalExpenseOutflow + totalInventoryOutflow;

  res.json(GetCashflowResponse.parse(serializeForZod({ periods, totalInflow, totalOutflow, netCashflow: totalInflow - totalOutflow })));
});

router.get("/analytics/revenue", async (req, res): Promise<void> => {
  const { period = "monthly", year } = req.query as Record<string, string>;
  let sales = await db.select().from(salesTable);
  if (year) sales = sales.filter(s => s.date.startsWith(year));

  const periods = groupByPeriod(
    sales.map(s => ({ date: s.date, amount: parseFloat(s.total as string) })),
    period
  );

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
  const totalRevenue = sales.reduce((s, r) => s + parseFloat(r.total as string), 0);

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
  let expenses = await db.select().from(expensesTable);
  if (year) expenses = expenses.filter(e => e.date.startsWith(year));

  const periods = groupByPeriod(
    expenses.map(e => ({ date: e.date, amount: parseFloat(e.amount as string) })),
    period
  );

  // By account
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

  const totalExpenses = expenses.reduce((s, e) => s + parseFloat(e.amount as string), 0);

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
  const { period = "monthly", year, month, quarter } = req.query as Record<string, string>;
  let sales = await db.select().from(salesTable);
  let expenses = await db.select().from(expensesTable);
  if (year) {
    sales = sales.filter(s => s.date.startsWith(year));
    expenses = expenses.filter(e => e.date.startsWith(year));
  }
  if (month) {
    const m = parseInt(month, 10);
    const mm = String(m).padStart(2, "0");
    const prefix = year ? `${year}-${mm}` : `-${mm}-`;
    if (year) {
      sales = sales.filter(s => s.date.startsWith(prefix));
      expenses = expenses.filter(e => e.date.startsWith(prefix));
    } else {
      sales = sales.filter(s => s.date.slice(5, 7) === mm);
      expenses = expenses.filter(e => e.date.slice(5, 7) === mm);
    }
  }
  if (quarter) {
    const q = parseInt(quarter, 10);
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    sales = sales.filter(s => {
      const m = parseInt(s.date.slice(5, 7), 10);
      return m >= startMonth && m <= endMonth;
    });
    expenses = expenses.filter(e => {
      const m = parseInt(e.date.slice(5, 7), 10);
      return m >= startMonth && m <= endMonth;
    });
  }

  // Compute COGS from sale lines × average batch cost per product
  const allSaleLines = await db
    .select({
      saleId: saleLinesTable.saleId,
      productId: saleLinesTable.productId,
      quantity: saleLinesTable.quantity,
      unitType: saleLinesTable.unitType,
    })
    .from(saleLinesTable)
    .innerJoin(productsTable, eq(saleLinesTable.productId, productsTable.id));

  const allInventory = await db
    .select({
      productId: inventoryBatchesTable.productId,
      costPerUnit: inventoryBatchesTable.costPerUnit,
      totalTablets: inventoryBatchesTable.totalTablets,
      tabsPerPack: inventoryBatchesTable.tabsPerPack,
      packsPerBox: inventoryBatchesTable.packsPerBox,
    })
    .from(inventoryBatchesTable);

  // Compute average cost per unit per product
  const costMap = new Map<number, number>();
  const productCostTotal = new Map<number, { costTotal: number; tabletTotal: number }>();
  for (const inv of allInventory) {
    const cost = parseFloat(inv.costPerUnit as string);
    const existing = productCostTotal.get(inv.productId) ?? { costTotal: 0, tabletTotal: 0 };
    existing.costTotal += cost * inv.totalTablets;
    existing.tabletTotal += inv.totalTablets;
    productCostTotal.set(inv.productId, existing);
  }
  for (const [pid, { costTotal, tabletTotal }] of productCostTotal) {
    costMap.set(pid, tabletTotal > 0 ? costTotal / tabletTotal : 0);
  }

  const saleIdSet = new Set(sales.map(s => s.id));
  const filteredLines = allSaleLines.filter(l => saleIdSet.has(l.saleId));

  let totalCOGS = 0;
  for (const line of filteredLines) {
    const qty = parseFloat(line.quantity as string);
    const cost = costMap.get(line.productId) ?? 0;
    const productBatches = allInventory.filter(i => i.productId === line.productId);
    const activeBatch = productBatches[0];
    const tabsPerPack = activeBatch ? activeBatch.totalTablets / activeBatch.packsPerBox : 1;
    const packsPerBox = activeBatch ? activeBatch.packsPerBox : 1;
    let tablets = qty;
    if (line.unitType === "pack") tablets = qty * tabsPerPack;
    else if (line.unitType === "box") tablets = qty * tabsPerPack * packsPerBox;
    totalCOGS += tablets * cost;
  }

  const revenueByPeriod = new Map<string, number>();
  const expenseByPeriod = new Map<string, number>();

  for (const s of sales) {
    const label = getPeriodLabel(s.date, period);
    revenueByPeriod.set(label, (revenueByPeriod.get(label) ?? 0) + parseFloat(s.total as string));
  }
  for (const e of expenses) {
    const label = getPeriodLabel(e.date, period);
    expenseByPeriod.set(label, (expenseByPeriod.get(label) ?? 0) + parseFloat(e.amount as string));
  }

  const allLabels = [...new Set([...revenueByPeriod.keys(), ...expenseByPeriod.keys()])].sort();
  const revenue = sales.reduce((s, r) => s + parseFloat(r.total as string), 0);
  const grossProfit = revenue - totalCOGS;
  const totalOpex = expenses.reduce((s, e) => s + parseFloat(e.amount as string), 0);
  const netProfit = grossProfit - totalOpex;

  const periods = allLabels.map(label => ({
    label,
    revenue: revenueByPeriod.get(label) ?? 0,
    expenses: expenseByPeriod.get(label) ?? 0,
    profit: (revenueByPeriod.get(label) ?? 0) - (expenseByPeriod.get(label) ?? 0),
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

  res.json(GetBalanceSheetResponse.parse(serializeForZod({
    assets,
    liabilities,
    equity,
    totalAssets: assets.reduce((s, a) => s + a.amount, 0),
    totalLiabilities: liabilities.reduce((s, a) => s + a.amount, 0),
    totalEquity: equity.reduce((s, a) => s + a.amount, 0),
  })));
});

router.get("/analytics/best-periods", async (_req, res): Promise<void> => {
  const allSales = await db.select().from(salesTable);

  const monthlyMap = new Map<string, number>();
  const quarterlyMap = new Map<string, number>();
  const yearlyMap = new Map<string, number>();

  for (const s of allSales) {
    const amount = parseFloat(s.total as string);
    const mLabel = getPeriodLabel(s.date, "monthly");
    const qLabel = getPeriodLabel(s.date, "quarterly");
    const yLabel = getPeriodLabel(s.date, "yearly");
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
