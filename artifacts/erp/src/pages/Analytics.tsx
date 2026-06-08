import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  useGetCashflow, useGetIncomeStatement, useListProducts, useListInventory,
  getGetCashflowQueryKey, getGetIncomeStatementQueryKey, getListProductsQueryKey, getListInventoryQueryKey,
} from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/hooks/use-currency";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

function StatRow({ label, value, sub, highlight, indent, fmt }: {
  label: string; value: number; sub?: string;
  highlight?: "profit" | "loss" | "neutral"; indent?: boolean;
  fmt: (v: number) => string;
}) {
  const color = highlight === "profit" ? "text-green-600 dark:text-green-400"
    : highlight === "loss" ? "text-destructive"
    : "";
  return (
    <div className={`flex justify-between items-center py-2.5 ${indent ? "pl-6" : ""}`}>
      <div>
        <span className={`text-sm font-medium ${color}`}>{label}</span>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      <span className={`font-bold tabular-nums ${color}`}>{fmt(value)}</span>
    </div>
  );
}

function PeriodPicker({
  period, setPeriod, year, setYear, month, setMonth, quarter, setQuarter,
}: {
  period: "monthly" | "quarterly" | "yearly";
  setPeriod: (p: "monthly" | "quarterly" | "yearly") => void;
  year: number; setYear: (y: number) => void;
  month: number; setMonth: (m: number) => void;
  quarter: number; setQuarter: (q: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Period type toggle */}
      <div className="flex rounded-lg border bg-muted/40 p-1 gap-1">
        {(["monthly", "quarterly", "yearly"] as const).map(p => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize
              ${period === p ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* Year selector */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost" size="icon" className="h-8 w-8"
          onClick={() => setYear(year - 1)}
          disabled={year <= CURRENT_YEAR - 5}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold w-12 text-center">{year}</span>
        <Button
          variant="ghost" size="icon" className="h-8 w-8"
          onClick={() => setYear(year + 1)}
          disabled={year >= CURRENT_YEAR}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Month picker — only when monthly */}
      {period === "monthly" && (
        <div className="flex flex-wrap gap-1">
          {MONTHS.map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => setMonth(i + 1)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors
                ${month === i + 1
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {/* Quarter picker — only when quarterly */}
      {period === "quarterly" && (
        <div className="flex gap-1">
          {[1, 2, 3, 4].map(q => (
            <button
              key={q}
              type="button"
              onClick={() => setQuarter(q)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors
                ${quarter === q
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                }`}
            >
              Q{q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Analytics() {
  const [period, setPeriod] = useState<"monthly" | "quarterly" | "yearly">("monthly");
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [quarter, setQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const { fmt } = useCurrency();

  const isParams = useMemo(() => {
    const base = { period, year } as Record<string, any>;
    if (period === "monthly") base.month = month;
    if (period === "quarterly") base.quarter = quarter;
    return base;
  }, [period, year, month, quarter]);

  const cashflowKey = useMemo(() => getGetCashflowQueryKey(isParams), [isParams]);
  const incomeKey = useMemo(() => getGetIncomeStatementQueryKey(isParams), [isParams]);

  const { data: cashflow, isLoading: isLoadingCashflow } = useGetCashflow(isParams, { query: { queryKey: cashflowKey } });
  const { data: incomeStatement, isLoading: isLoadingIS } = useGetIncomeStatement(isParams, { query: { queryKey: incomeKey } });
  const { data: products } = useListProducts({}, { query: { queryKey: getListProductsQueryKey({}) } });
  const { data: inventory } = useListInventory({ view: "tablets" }, { query: { queryKey: getListInventoryQueryKey({ view: "tablets" }) } });

  const inventoryValuation = (products ?? []).map(p => {
    const batches = (inventory ?? []).filter(b => b.productName === p.name);
    const remainingTablets = batches.reduce((s, b) => s + b.remainingTablets, 0);
    const weightedCost = batches.reduce((s, b) => s + b.remainingTablets * b.costPerUnit, 0);
    const weightedSell = batches.reduce((s, b) => s + b.remainingTablets * b.sellingPricePerUnit, 0);
    const costValue = weightedCost;
    const sellingValue = weightedSell;
    const margin = costValue > 0 ? ((sellingValue - costValue) / costValue * 100) : 0;
    return { name: p.name, remainingTablets, costValue, sellingValue, margin };
  }).filter(p => p.remainingTablets > 0).sort((a, b) => b.costValue - a.costValue);

  const totalCostValue = inventoryValuation.reduce((s, p) => s + p.costValue, 0);
  const totalSellingValue = inventoryValuation.reduce((s, p) => s + p.sellingValue, 0);

  const revenue = incomeStatement?.revenue ?? 0;
  const cogs = revenue - (incomeStatement?.grossProfit ?? revenue);
  const grossProfit = incomeStatement?.grossProfit ?? 0;
  const opex = incomeStatement?.expenses ?? 0;
  const netProfit = incomeStatement?.netProfit ?? 0;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue * 100).toFixed(1) : "0.0";
  const netMarginPct = revenue > 0 ? (netProfit / revenue * 100).toFixed(1) : "0.0";

  const periodLabel = period === "monthly"
    ? `${MONTHS[month - 1]} ${year}`
    : period === "quarterly"
    ? `Q${quarter} ${year}`
    : `${year}`;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-1">Financial performance and inventory insights.</p>
      </div>

      <PeriodPicker
        period={period} setPeriod={setPeriod}
        year={year} setYear={setYear}
        month={month} setMonth={setMonth}
        quarter={quarter} setQuarter={setQuarter}
      />

      <Tabs defaultValue="pl" className="space-y-6">
        <TabsList className="bg-card border h-12">
          <TabsTrigger value="pl" className="h-10 px-6">Profit & Loss</TabsTrigger>
          <TabsTrigger value="cashflow" className="h-10 px-6">Cash Flow</TabsTrigger>
          <TabsTrigger value="inventory" className="h-10 px-6">Inventory Value</TabsTrigger>
        </TabsList>

        {/* ── Profit & Loss ── */}
        <TabsContent value="pl" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Income Statement</CardTitle>
                <CardDescription>{periodLabel}</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingIS ? (
                  <div className="space-y-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                ) : revenue === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">
                    No sales data for {periodLabel}. Try selecting a different period.
                  </div>
                ) : (
                  <div className="divide-y">
                    <StatRow label="Revenue" value={revenue} sub="Total sales income" fmt={fmt} />
                    <StatRow label="Cost of Goods Sold" value={cogs} sub="Inventory cost of items sold" indent fmt={fmt} />
                    <div className="border-t-2 border-foreground/20">
                      <StatRow
                        label={`Gross Profit (${grossMarginPct}% margin)`}
                        value={grossProfit}
                        highlight={grossProfit >= 0 ? "profit" : "loss"}
                        fmt={fmt}
                      />
                    </div>
                    <StatRow label="Operating Expenses" value={opex} sub="Rent, salaries, utilities…" indent fmt={fmt} />
                    <div className="border-t-2 border-foreground/20">
                      <StatRow
                        label={`Net Profit (${netMarginPct}% margin)`}
                        value={netProfit}
                        highlight={netProfit >= 0 ? "profit" : "loss"}
                        fmt={fmt}
                      />
                    </div>
                    <div className="pt-4 flex items-center gap-1.5 text-sm">
                      {netProfit >= 0
                        ? <TrendingUp className="w-4 h-4 text-green-600" />
                        : <TrendingDown className="w-4 h-4 text-destructive" />}
                      <span className="text-muted-foreground">
                        {netProfit >= 0 ? "Profitable" : "Running at a loss"}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Revenue vs Expenses</CardTitle>
                <CardDescription>Period-by-period breakdown — {periodLabel}</CardDescription>
              </CardHeader>
              <CardContent className="h-[340px]">
                {isLoadingIS ? (
                  <Skeleton className="w-full h-full" />
                ) : (incomeStatement?.periods ?? []).length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={incomeStatement!.periods} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v, 0)} />
                      <Tooltip formatter={(v: any) => fmt(Number(v))} />
                      <Bar dataKey="revenue" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="Revenue" />
                      <Bar dataKey="expenses" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="Expenses" />
                      <Bar dataKey="profit" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Net Profit" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    No sales data for {periodLabel}.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Cash Flow ── */}
        <TabsContent value="cashflow" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Cash Flow</CardTitle>
                <CardDescription>Inflow (sales) vs Outflow (expenses + inventory) — {periodLabel}</CardDescription>
              </CardHeader>
              <CardContent className="h-[350px]">
                {isLoadingCashflow ? (
                  <Skeleton className="w-full h-full" />
                ) : (cashflow?.periods ?? []).length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cashflow!.periods} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v, 0)} />
                      <Tooltip formatter={(v: any) => fmt(Number(v))} />
                      <Bar dataKey="inflow" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="Inflow" />
                      <Bar dataKey="outflow" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="Outflow" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    No data for {periodLabel}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Net Position</CardTitle><CardDescription>{periodLabel}</CardDescription></CardHeader>
              <CardContent className="space-y-6">
                {isLoadingCashflow ? (
                  <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
                ) : (
                  <>
                    <div>
                      <p className="text-sm text-muted-foreground font-medium mb-1">Total Inflow</p>
                      <p className="text-2xl font-bold text-green-600 tabular-nums">{fmt(cashflow?.totalInflow ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground font-medium mb-1">Total Outflow</p>
                      <p className="text-2xl font-bold text-destructive tabular-nums">{fmt(cashflow?.totalOutflow ?? 0)}</p>
                      <p className="text-xs text-muted-foreground mt-1">Expenses + inventory purchases</p>
                    </div>
                    <div className="pt-4 border-t">
                      <p className="text-sm text-muted-foreground font-medium mb-1">Net Cash Flow</p>
                      <p className={`text-2xl font-bold tabular-nums ${(cashflow?.netCashflow ?? 0) >= 0 ? "text-primary" : "text-destructive"}`}>
                        {fmt(cashflow?.netCashflow ?? 0)}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Inventory Valuation ── */}
        <TabsContent value="inventory" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground font-medium">Total Value at Cost</p>
                <p className="text-2xl font-bold mt-1 tabular-nums">{fmt(totalCostValue)}</p>
                <p className="text-xs text-muted-foreground mt-1">What you paid for current stock</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground font-medium">Total Value at Selling Price</p>
                <p className="text-2xl font-bold text-primary mt-1 tabular-nums">{fmt(totalSellingValue)}</p>
                <p className="text-xs text-muted-foreground mt-1">Max revenue if all sold at retail</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground font-medium">Potential Gross Profit</p>
                <p className={`text-2xl font-bold mt-1 tabular-nums ${totalSellingValue - totalCostValue >= 0 ? "text-green-600" : "text-destructive"}`}>
                  {fmt(totalSellingValue - totalCostValue)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {totalCostValue > 0 ? `${((totalSellingValue - totalCostValue) / totalCostValue * 100).toFixed(1)}% margin` : "No stock"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Inventory Valuation by Product</CardTitle>
              <CardDescription>Stock remaining × unit cost / selling price</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Tablets in Stock</TableHead>
                    <TableHead className="text-right">Value at Cost</TableHead>
                    <TableHead className="text-right">Value at Selling Price</TableHead>
                    <TableHead className="text-right">Potential Profit</TableHead>
                    <TableHead className="text-right">Margin %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryValuation.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                        No stock in inventory. Receive inventory to see valuation.
                      </TableCell>
                    </TableRow>
                  ) : inventoryValuation.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.remainingTablets.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(p.costValue)}</TableCell>
                      <TableCell className="text-right tabular-nums text-primary font-medium">{fmt(p.sellingValue)}</TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${p.sellingValue - p.costValue >= 0 ? "text-green-600" : "text-destructive"}`}>
                        {fmt(p.sellingValue - p.costValue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{p.margin.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                  {inventoryValuation.length > 0 && (
                    <TableRow className="bg-muted/30 font-semibold border-t-2">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{inventoryValuation.reduce((s, p) => s + p.remainingTablets, 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{fmt(totalCostValue)}</TableCell>
                      <TableCell className="text-right text-primary">{fmt(totalSellingValue)}</TableCell>
                      <TableCell className={`text-right ${totalSellingValue - totalCostValue >= 0 ? "text-green-600" : "text-destructive"}`}>
                        {fmt(totalSellingValue - totalCostValue)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {totalCostValue > 0 ? `${((totalSellingValue - totalCostValue) / totalCostValue * 100).toFixed(1)}%` : "—"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
