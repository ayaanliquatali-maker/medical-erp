import { Router } from "express";
import Groq from "groq-sdk";
import { db } from "@workspace/db";
import { salesTable, saleLinesTable, productsTable, inventoryBatchesTable, expensesTable, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { AiChatBody, AiChatResponse } from "@workspace/api-zod";

const router = Router();

async function buildStoreContext(): Promise<string> {
  const [allProducts, allSales, allExpenses, allBatches, allAccounts] = await Promise.all([
    db.select().from(productsTable),
    db.select().from(salesTable),
    db.select().from(expensesTable),
    db.select().from(inventoryBatchesTable),
    db.select().from(accountsTable),
  ]);

  const allSaleLines = await db
    .select({
      saleId: saleLinesTable.saleId,
      productId: saleLinesTable.productId,
      quantity: saleLinesTable.quantity,
      unitType: saleLinesTable.unitType,
      unitPrice: saleLinesTable.unitPrice,
      total: saleLinesTable.total,
    })
    .from(saleLinesTable)
    .innerJoin(productsTable, eq(saleLinesTable.productId, productsTable.id));

  const totalRevenue = allSales.reduce((s, r) => s + parseFloat(r.total as string), 0);
  const totalExpenses = allExpenses.reduce((s, e) => s + parseFloat(e.amount as string), 0);

  // COGS from batch costs
  let totalCOGS = 0;
  for (const line of allSaleLines) {
    const qty = parseFloat(line.quantity as string);
    const productBatches = allBatches.filter(b => b.productId === line.productId);
    const activeBatch = productBatches[0];
    const cost = activeBatch ? parseFloat(activeBatch.costPerUnit as string) : 0;
    const tabsPerPack = activeBatch ? activeBatch.tabsPerPack : 1;
    const packsPerBox = activeBatch ? activeBatch.packsPerBox : 1;
    let tablets = qty;
    if (line.unitType === "pack") tablets = qty * tabsPerPack;
    else if (line.unitType === "box") tablets = qty * tabsPerPack * packsPerBox;
    else tablets = qty;
    totalCOGS += tablets * cost;
  }
  const grossProfit = totalRevenue - totalCOGS;
  const netProfit = grossProfit - totalExpenses;

  const today = new Date().toISOString().slice(0, 10);
  const todaySales = allSales.filter(s => s.date === today);
  const todayRevenue = todaySales.reduce((s, r) => s + parseFloat(r.total as string), 0);
  const in30Days = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const in90Days = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  // Per-product detailed stats
  const productDetails = allProducts.map(p => {
    const batches = allBatches.filter(b => b.productId === p.id);
    const remainingTablets = batches.reduce((s, b) => s + b.remainingTablets, 0);
    const activeBatch = batches.filter(b => b.remainingTablets > 0).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0];
    const tabsPerPack = activeBatch?.tabsPerPack ?? 1;
    const packsPerBox = activeBatch?.packsPerBox ?? 1;
    const remainingPacks = Math.floor(remainingTablets / tabsPerPack);
    const remainingBoxes = Math.floor(remainingPacks / packsPerBox);

    const costPerTab = activeBatch ? parseFloat(activeBatch.costPerUnit as string) : 0;
    const sellPerTab = activeBatch ? parseFloat(activeBatch.sellingPricePerUnit as string) : 0;
    const sellPerPack = activeBatch ? parseFloat(activeBatch.sellingPricePerPack as string) : 0;
    const sellPerBox = activeBatch ? parseFloat(activeBatch.sellingPricePerBox as string) : 0;

    const costValue = remainingTablets * costPerTab;
    const sellingValue = remainingTablets * sellPerTab;
    const potentialProfit = sellingValue - costValue;
    const profitMarginPct = costPerTab > 0 ? ((sellPerTab - costPerTab) / costPerTab * 100).toFixed(1) : "N/A";

    // Sales history for this product
    const productSaleLines = allSaleLines.filter(l => l.productId === p.id);
    let totalTabletsSold = 0;
    let totalProductRevenue = 0;
    for (const line of productSaleLines) {
      const qty = parseFloat(line.quantity as string);
      let tablets = qty;
      if (line.unitType === "pack") tablets = qty * tabsPerPack;
      else if (line.unitType === "box") tablets = qty * tabsPerPack * packsPerBox;
      else tablets = qty;
      totalTabletsSold += tablets;
      totalProductRevenue += parseFloat(line.total as string);
    }

    const nearExpiry = batches.filter(b => b.remainingTablets > 0 && b.expiryDate <= in90Days && b.expiryDate >= today);
    const expired = batches.filter(b => b.remainingTablets > 0 && b.expiryDate < today);

    const batchDetail = batches.filter(b => b.remainingTablets > 0).map(b =>
      `  Batch ${b.batchNumber || b.id}: ${b.remainingTablets} tabs remaining, expiry ${b.expiryDate}, cost ₨${parseFloat(b.costPerUnit as string).toFixed(2)}/tab`
    ).join("\n");

    return `- ${p.name}${p.genericName ? ` (${p.genericName})` : ""}:
  Status: ${p.isActive ? "Active" : "Inactive"}, Category: ${p.category || "Uncategorized"}
  Stock: ${remainingTablets} tablets | ${remainingPacks} packs | ${remainingBoxes} boxes
  Reorder Level: ${p.reorderLevel} tablets${remainingTablets <= p.reorderLevel ? " ⚠️ LOW STOCK" : ""}
  Pricing: ₨${costPerTab.toFixed(2)}/tab (cost) | ₨${sellPerTab.toFixed(2)}/tab | ₨${sellPerPack.toFixed(2)}/pack | ₨${sellPerBox.toFixed(2)}/box
  Profit Margin: ${profitMarginPct}% per tablet
  Inventory Value: ₨${costValue.toFixed(2)} at cost | ₨${sellingValue.toFixed(2)} at selling price
  Potential Profit if all sold: ₨${potentialProfit.toFixed(2)}
  All-time Sales: ${totalTabletsSold} tablets sold, Revenue: ₨${totalProductRevenue.toFixed(2)}
${nearExpiry.length > 0 ? `  ⚠️ Near expiry batches (within 90 days): ${nearExpiry.length}` : ""}
${expired.length > 0 ? `  🔴 Expired batches with remaining stock: ${expired.length}` : ""}
${batchDetail ? `  Active batches:\n${batchDetail}` : "  No active batches"}`;
  });

  // Expense breakdown by account
  const expenseBreakdown = new Map<string, number>();
  for (const e of allExpenses) {
    const acc = allAccounts.find(a => a.id === e.expenseAccountId);
    const name = acc?.name ?? "Unknown";
    expenseBreakdown.set(name, (expenseBreakdown.get(name) ?? 0) + parseFloat(e.amount as string));
  }
  const expenseLines = Array.from(expenseBreakdown.entries())
    .map(([name, amount]) => `  ${name}: ₨${amount.toFixed(2)}`)
    .join("\n");

  // Total inventory value
  const totalCostValue = allBatches.reduce((s, b) => s + b.remainingTablets * parseFloat(b.costPerUnit as string), 0);

  // Sales breakdown by date
  const salesByDate = new Map<string, { count: number; total: number }>();
  for (const s of allSales) {
    const entry = salesByDate.get(s.date) ?? { count: 0, total: 0 };
    entry.count++;
    entry.total += parseFloat(s.total as string);
    salesByDate.set(s.date, entry);
  }
  const dailySalesLines = Array.from(salesByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { count, total }]) => `  ${date}: ₨${total.toFixed(2)} (${count} transaction${count > 1 ? "s" : ""})`)
    .join("\n");

  return `=== MediERP Store Data (as of ${today}) ===

FINANCIAL SUMMARY:
- Total Revenue (all time): ₨${totalRevenue.toFixed(2)}
- Cost of Goods Sold (COGS): ₨${totalCOGS.toFixed(2)}
- Gross Profit: ₨${grossProfit.toFixed(2)} (margin: ${totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : "0"}%)
- Total Operating Expenses: ₨${totalExpenses.toFixed(2)}
- Net Profit: ₨${netProfit.toFixed(2)}
- Today's Revenue: ₨${todayRevenue.toFixed(2)} (${todaySales.length} transactions)
- Total Sales Transactions: ${allSales.length}

DAILY SALES BREAKDOWN:
${dailySalesLines || "  No sales recorded"}

INVENTORY SUMMARY:
- Total Products: ${allProducts.length} (${allProducts.filter(p => p.isActive).length} active)
- Total Inventory Value at Cost: ₨${totalCostValue.toFixed(2)}

EXPENSE BREAKDOWN:
${expenseLines || "  No expenses recorded"}

PRODUCTS & INVENTORY DETAIL:
${productDetails.join("\n\n")}

INSTRUCTIONS FOR CALCULATIONS:
- When asked about revenue for a specific date, look at the DAILY SALES BREAKDOWN above
- When asked about max revenue from selling stock at a custom price: multiply that price by the tablet count for that product
- When asked about profit at a custom price: (custom price - cost per tablet) × tablets in stock
- Always show exact numbers from the data above
- Currency is PKR (Pakistani Rupees, symbol ₨)`;
}

router.post("/ai/chat", async (req, res): Promise<void> => {
  const parsed = AiChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { message, history = [] } = parsed.data;

  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    res.status(500).json({ error: "AI service not configured" });
    return;
  }

  const storeContext = await buildStoreContext();

  const groq = new Groq({ apiKey: groqApiKey });

  const systemPrompt = `You are MediBot, an intelligent AI assistant for a medical store ERP system. You have access to COMPLETE real-time data about this store including exact stock quantities, prices, costs, and financial figures.

${storeContext}

RULES:
1. Always use the exact numbers from the data above. Never say you don't have the data if it is in the summary.
2. When asked to calculate revenue at a specific price: multiply that price by the stock quantity shown above.
3. When asked about profit: calculate (selling price - cost per tablet) × quantity.
4. Show your arithmetic clearly, e.g. "500 tablets × ₨30 = ₨15,000"
5. Be concise, direct, and accurate. Currency is PKR (₨).`;

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map(h => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user", content: message },
  ];

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages,
    max_tokens: 1024,
    temperature: 0.3,
  });

  const response = completion.choices[0]?.message?.content ?? "I couldn't generate a response. Please try again.";
  res.json(AiChatResponse.parse({ response }));
});

export default router;
