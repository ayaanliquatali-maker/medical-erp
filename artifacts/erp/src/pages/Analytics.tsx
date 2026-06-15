import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  useGetCashflow, useGetIncomeStatement, useListProducts, useListInventory,
  useGetTopProducts, useGetExpenseAnalytics, useGetBalanceSheet,
  getGetCashflowQueryKey, getGetIncomeStatementQueryKey, getListProductsQueryKey, getListInventoryQueryKey,
  getGetTopProductsQueryKey, getGetExpenseAnalyticsQueryKey, getGetBalanceSheetQueryKey,
} from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Settings2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrency } from "@/hooks/use-currency";
import { cn } from "@/lib/utils";

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
  period, setPeriod, year, setYear, months, setMonths, quarter, setQuarter, day, setDay,
}: {
  period: "daily" | "monthly" | "quarterly" | "yearly";
  setPeriod: (p: "daily" | "monthly" | "quarterly" | "yearly") => void;
  year: number; setYear: (y: number) => void;
  months: number[]; setMonths: (m: number[]) => void;
  quarter: number; setQuarter: (q: number) => void;
  day?: number; setDay?: (d: number) => void;
}) {
  const toggleMonth = (m: number) => {
    setMonths(months.includes(m) ? months.filter(x => x !== m) : [...months, m]);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Period type toggle */}
      <div className="flex rounded-lg border bg-muted/40 p-1 gap-1">
        {(["daily", "monthly", "quarterly", "yearly"] as const).map(p => (
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
              onClick={() => toggleMonth(i + 1)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors
                ${months.includes(i + 1)
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

      {/* Day picker — only when daily */}
      {period === "daily" && setDay && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Day:</span>
          <Input
            type="number" min={1} max={31}
            value={day ?? new Date().getDate()}
            onChange={e => setDay(parseInt(e.target.value) || 1)}
            className="w-16 h-8 text-xs"
          />
        </div>
      )}
    </div>
  );
}

function getDateRangeStr(period: "daily" | "monthly" | "quarterly" | "yearly", year: number, months: number[], quarter: number, day?: number): string {
  if (period === "daily") {
    const d = day ?? new Date().getDate();
    const m = months.length > 0 ? months[0] : new Date().getMonth() + 1;
    return `${MONTHS[m - 1]} ${d}, ${year}`;
  }
  if (period === "monthly") {
    const active = months.length > 0 ? months : [new Date().getMonth() + 1];
    const sorted = [...active].sort((a, b) => a - b);
    const from = `${MONTHS[sorted[0] - 1]} 1, ${year}`;
    const lastM = sorted[sorted.length - 1];
    const to = `${MONTHS[lastM - 1]} ${new Date(year, lastM, 0).getDate()}, ${year}`;
    return `${from} — ${to}`;
  }
  if (period === "quarterly") {
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = quarter * 3;
    const from = `${MONTHS[startMonth - 1]} 1, ${year}`;
    const to = `${MONTHS[endMonth - 1]} ${new Date(year, endMonth, 0).getDate()}, ${year}`;
    return `${from} — ${to}`;
  }
  return `Jan 1, ${year} — Dec 31, ${year}`;
}

export default function Analytics() {
  const [period, setPeriod] = useState<"daily" | "monthly" | "quarterly" | "yearly">("yearly");
  const [year, setYear] = useState(CURRENT_YEAR);
  const [months, setMonths] = useState<number[]>([new Date().getMonth() + 1]);
  const [quarter, setQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const [day, setDay] = useState(new Date().getDate());
  const { fmt } = useCurrency();

  const lastMonth = useMemo(() => months.length > 0 ? months[months.length - 1] : new Date().getMonth() + 1, [months]);

  const isParams = useMemo(() => {
    const base = { period, year } as Record<string, any>;
    if (period === "daily") { base.month = lastMonth; base.day = day; }
    if (period === "monthly") base.month = lastMonth;
    if (period === "quarterly") base.quarter = quarter;
    return base;
  }, [period, year, lastMonth, quarter, day]);

  const cashflowKey = useMemo(() => getGetCashflowQueryKey(isParams), [isParams]);
  const incomeKey = useMemo(() => getGetIncomeStatementQueryKey(isParams), [isParams]);

  const { data: cashflow, isLoading: isLoadingCashflow } = useGetCashflow(isParams, { query: { queryKey: cashflowKey } });
  const { data: incomeStatement, isLoading: isLoadingIS } = useGetIncomeStatement(isParams, { query: { queryKey: incomeKey } });
  const { data: products, isLoading: isLoadingProducts } = useListProducts({}, { query: { queryKey: getListProductsQueryKey({}) } });
  const { data: inventory, isLoading: isLoadingInventory } = useListInventory({ view: "tablets" }, { query: { queryKey: getListInventoryQueryKey({ view: "tablets" }) } });

  const dateRange = useMemo(() => getDateRangeStr(period, year, months, quarter, day), [period, year, months, quarter, day]);

  const asOf = useMemo(() => {
    if (period === "daily") {
      const m = String(lastMonth).padStart(2, "0");
      const d = String(day).padStart(2, "0");
      return `${year}-${m}-${d}`;
    }
    if (period === "monthly") {
      const m = String(lastMonth).padStart(2, "0");
      return `${year}-${m}-${new Date(year, lastMonth, 0).getDate()}`;
    }
    if (period === "quarterly") {
      const endMonth = quarter * 3;
      const m = String(endMonth).padStart(2, "0");
      return `${year}-${m}-${new Date(year, endMonth, 0).getDate()}`;
    }
    return `${year}-12-31`;
  }, [period, year, lastMonth, quarter, day]);

  const filteredInventory = useMemo(() => {
    let list = Array.isArray(inventory) ? inventory : [];
    const yearStr = String(year);
    list = list.filter(b => (b.receivedAt ?? "").startsWith(yearStr));
    if (period === "monthly" && months.length > 0) {
      list = list.filter(b => {
        const m = (b.receivedAt ?? "").slice(5, 7);
        return months.some(ms => String(ms).padStart(2, "0") === m);
      });
    }
    if (period === "quarterly") {
      const startMonth = (quarter - 1) * 3 + 1;
      const endMonth = quarter * 3;
      list = list.filter(b => {
        const m = parseInt((b.receivedAt ?? "").slice(5, 7), 10);
        return m >= startMonth && m <= endMonth;
      });
    }
    return list;
  }, [inventory, period, year, months, quarter]);

  const inventoryValuation = (products ?? []).map(p => {
    const batches = filteredInventory.filter(b => b.productName === p.name);
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

  const periodLabel = period === "daily"
    ? `${MONTHS[lastMonth - 1]} ${day}, ${year}`
    : period === "monthly"
    ? `${MONTHS[lastMonth - 1]} ${year}`
    : period === "quarterly"
    ? `Q${quarter} ${year}`
    : `${year}`;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Financial performance and inventory insights.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker
          period={period} setPeriod={setPeriod}
          year={year} setYear={setYear}
          months={months} setMonths={setMonths}
          quarter={quarter} setQuarter={setQuarter}
          day={day} setDay={setDay}
        />
        <span className="text-xs text-muted-foreground ml-1">{dateRange}</span>
      </div>

      <Tabs defaultValue="pl" className="space-y-6">
        <TabsList className="bg-card border h-12 flex-wrap">
          <TabsTrigger value="pl" className="h-10 px-6">Profit & Loss</TabsTrigger>
          <TabsTrigger value="cashflow" className="h-10 px-6">Cash Flow</TabsTrigger>
          <TabsTrigger value="inventory" className="h-10 px-6">Inventory</TabsTrigger>
          <TabsTrigger value="top-products" className="h-10 px-6">Top Products</TabsTrigger>
          <TabsTrigger value="expenses" className="h-10 px-6">Expenses</TabsTrigger>
          <TabsTrigger value="trends" className="h-10 px-6">Trends</TabsTrigger>
          <TabsTrigger value="balance-sheet" className="h-10 px-6">Balance Sheet</TabsTrigger>
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
          {isLoadingInventory || isLoadingProducts ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28" />)}
              </div>
              <Card><CardContent className="p-6"><div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div></CardContent></Card>
            </div>
          ) : (<>
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
          </>)}
        </TabsContent>

        {/* ── Top Products ── */}
        <TabsContent value="top-products" className="space-y-6">
          <TopProductsSection fmt={fmt} />
        </TabsContent>

        {/* ── Expenses by Category ── */}
        <TabsContent value="expenses" className="space-y-6">
          <ExpensesSection fmt={fmt} />
        </TabsContent>

        {/* ── Trends ── */}
        <TabsContent value="trends" className="space-y-6">
          <TrendsSection fmt={fmt} />
        </TabsContent>

        {/* ── Balance Sheet ── */}
        <TabsContent value="balance-sheet" className="space-y-6">
          <BalanceSheetSection fmt={fmt} asOf={asOf} periodLabel={periodLabel} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── Chart Colors ── */
const PIE_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(330, 80%, 60%)", "hsl(200, 80%, 60%)", "hsl(160, 80%, 60%)", "hsl(280, 80%, 60%)", "hsl(30, 80%, 60%)"];

/* ── Top Products ── */
function TopProductsSection({ fmt }: { fmt: (v: number) => string }) {
  const [count, setCount] = useState(5);
  const { data, isLoading } = useGetTopProducts({ limit: count }, { query: { queryKey: getGetTopProductsQueryKey({ limit: count }) } });
  if (isLoading || !data) return <Skeleton className="h-80 w-full" />;
  const items = data.topSelling?.slice(0, count) ?? [];
  if (items.length === 0) return (
    <Card><CardContent className="py-16 text-center text-muted-foreground text-sm">No sales data yet</CardContent></Card>
  );
  const total = items.reduce((s, i) => s + i.revenue, 0);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Top Selling Products</CardTitle>
          <CardDescription>Revenue breakdown by product</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <Label className="text-xs">Show top</Label>
            <Input type="number" min={1} max={50} value={count} onChange={e => setCount(parseInt(e.target.value) || 5)} className="w-20 h-8" />
          </div>
          {items.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No products sold</div>
          ) : (
            <div className="space-y-6">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={items} dataKey="revenue" nameKey="productName" cx="50%" cy="50%" outerRadius={90} innerRadius={50} label={({ productName, percent }) => `${(percent * 100).toFixed(0)}%`}>
                      {items.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {items.map((p, i) => (
                  <div key={p.productId} className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-muted-foreground">{p.productName}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-muted-foreground tabular-nums">{((p.revenue / total) * 100).toFixed(1)}%</span>
                      <span className="font-semibold tabular-nums">{fmt(p.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Summary</CardTitle><CardDescription>{count} products</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Total Revenue (top {items.length})</p>
            <p className="text-2xl font-bold tabular-nums">{fmt(total)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Top Product</p>
            <p className="text-lg font-semibold">{items[0]?.productName ?? "—"}</p>
            <p className="text-sm text-muted-foreground tabular-nums">{fmt(items[0]?.revenue ?? 0)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Expenses by Category ── */
function ExpensesSection({ fmt }: { fmt: (v: number) => string }) {
  const now = new Date();
  const [period, setPeriod] = useState<"daily" | "monthly" | "quarterly" | "yearly">("yearly");
  const [year, setYear] = useState(now.getFullYear());
  const { data, isLoading } = useGetExpenseAnalytics({ period, year }, { query: { queryKey: getGetExpenseAnalyticsQueryKey({ period, year }) } });
  const items = (data?.byAccount ?? []).filter(a => a.amount > 0);
  const totalExpenses = items.reduce((s, a) => s + a.amount, 0);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <Card className="lg:col-span-3">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Expenses by Category</CardTitle>
              <CardDescription>Non-COGS expenses for the selected period</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={period} onValueChange={(v: "daily" | "monthly" | "quarterly" | "yearly") => setPeriod(v)}>
                <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
              <Select value={String(year)} onValueChange={v => setYear(parseInt(v))}>
                <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : items.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">No expenses for this period</div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={items} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => fmt(Number(v), 0)} />
                  <YAxis type="category" dataKey="accountName" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={100} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="amount" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Summary</CardTitle><CardDescription>{year}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Total Expenses</p>
            <p className="text-2xl font-bold text-destructive tabular-nums">{fmt(totalExpenses)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Categories</p>
            <p className="text-2xl font-bold tabular-nums">{items.length}</p>
          </div>
          {items.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground">Top Category</p>
              <p className="text-lg font-semibold">{items[items.length - 1]?.accountName ?? "—"}</p>
              <p className="text-sm text-destructive tabular-nums">{fmt(items[items.length - 1]?.amount ?? 0)}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Revenue & Profit Trend ── */
function TrendsSection({ fmt }: { fmt: (v: number) => string }) {
  const now = new Date();
  const [period, setPeriod] = useState<"daily" | "monthly" | "quarterly" | "yearly">("monthly");
  const [year, setYear] = useState(now.getFullYear());
  const params = useMemo(() => ({ period, year }), [period, year]);
  const { data, isLoading } = useGetIncomeStatement(params, { query: { queryKey: getGetIncomeStatementQueryKey(params) } });

  const chartData = useMemo(() => {
    if (!data?.periods) return [];
    return data.periods.map(p => ({
      label: p.label,
      Revenue: p.revenue,
      "Net Profit": p.profit,
      Expenses: p.expenses,
    }));
  }, [data]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Revenue & Profit Trend</CardTitle>
              <CardDescription>Period-over-period performance</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={period} onValueChange={(v: "daily" | "monthly" | "quarterly" | "yearly") => setPeriod(v)}>
                <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
              <Select value={String(year)} onValueChange={v => setYear(parseInt(v))}>
                <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : chartData.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">No data for {year}</div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(Number(v), 0)} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Line type="monotone" dataKey="Revenue" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Net Profit" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Expenses" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Period Details</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Net Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chartData.map((r, i) => {
                  const margin = r.Revenue > 0 ? ((r["Net Profit"] / r.Revenue) * 100).toFixed(1) : "0.0";
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.Revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">{fmt(r.Expenses)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums font-semibold", r["Net Profit"] >= 0 ? "text-green-600" : "text-destructive")}>
                        {fmt(r["Net Profit"])}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{margin}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Balance Sheet ── */
function BalanceSheetSection({ fmt, asOf, periodLabel }: { fmt: (v: number) => string; asOf: string; periodLabel: string }) {
  const { data, isLoading } = useGetBalanceSheet({ asOf }, { query: { queryKey: getGetBalanceSheetQueryKey({ asOf }) } });
  if (isLoading || !data) return <Skeleton className="h-80 w-full" />;

  const isBalanced = Math.abs(data.difference) < 0.01;

  const sections = [
    { title: "Assets", items: data.assets, total: data.totalAssets, color: "text-green-600" },
    { title: "Liabilities", items: data.liabilities, total: data.totalLiabilities, color: "text-destructive" },
    { title: "Equity", items: data.equity, total: data.totalEquity, color: "text-primary" },
  ] as const;

  return (
    <>
      {!isBalanced && (
        <div className="p-4 rounded-lg border-2 border-destructive bg-destructive/5 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-semibold text-destructive">Balance sheet is not balanced!</p>
            <p className="text-xs text-muted-foreground">
              Assets ({fmt(data.totalAssets)}) vs Liabilities + Equity ({fmt(data.totalLiabilitiesEquity)})
              — Difference: {fmt(data.difference)}
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Balance Sheet</CardTitle>
          <CardDescription>As of {periodLabel} ({asOf})</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {sections.map(sec => (
              <div key={sec.title} className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{sec.title}</h3>
                <div className="divide-y">
                  {sec.items.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">No accounts</p>
                  ) : sec.items.map(a => (
                    <div key={a.accountId} className="flex justify-between items-center py-2 text-sm">
                      <span className="text-muted-foreground">{a.accountName}</span>
                      <span className="font-medium tabular-nums">{fmt(a.amount)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center pt-2 border-t-2 font-bold text-sm">
                  <span>Total {sec.title}</span>
                  <span className={`tabular-nums ${sec.color}`}>{fmt(sec.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Accounting Equation</CardTitle>
              <CardDescription>Assets = Liabilities + Equity</CardDescription>
            </div>
            {isBalanced ? (
              <Badge variant="outline" className="text-green-600 border-green-400 bg-green-50 dark:bg-green-950/20">Balanced</Badge>
            ) : (
              <Badge variant="outline" className="text-destructive border-destructive bg-destructive/5">Unbalanced</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
              <p className="text-xs text-muted-foreground font-medium">Assets</p>
              <p className="text-xl font-bold tabular-nums text-green-600">{fmt(data.totalAssets)}</p>
            </div>
            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 flex items-center justify-center text-lg text-muted-foreground font-bold">
              {isBalanced ? "=" : "≠"}
            </div>
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
                <p className="text-xs text-muted-foreground font-medium">Liabilities</p>
                <p className="text-xl font-bold tabular-nums text-destructive">{fmt(data.totalLiabilities)}</p>
              </div>
              <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                <p className="text-xs text-muted-foreground font-medium">Equity (incl. Retained Earnings)</p>
                <p className="text-xl font-bold tabular-nums text-primary">{fmt(data.totalEquity)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted border">
                <p className="text-xs text-muted-foreground font-medium">Liabilities + Equity</p>
                <p className="text-xl font-bold tabular-nums">{fmt(data.totalLiabilitiesEquity)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
