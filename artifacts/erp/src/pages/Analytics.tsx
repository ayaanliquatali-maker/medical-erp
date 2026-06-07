import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  useGetCashflow, useGetIncomeStatement, useListProducts, useListInventory,
  getGetCashflowQueryKey, getGetIncomeStatementQueryKey, getListProductsQueryKey, getListInventoryQueryKey,
} from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

function StatRow({ label, value, sub, highlight, indent }: { label: string; value: number; sub?: string; highlight?: "profit" | "loss" | "neutral"; indent?: boolean }) {
  const color = highlight === "profit" ? "text-green-600 dark:text-green-400"
    : highlight === "loss" ? "text-destructive"
    : "";
  return (
    <div className={`flex justify-between items-center py-2 ${indent ? "pl-6" : ""}`}>
      <div>
        <span className={`text-sm font-medium ${color}`}>{label}</span>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      <span className={`font-bold tabular-nums ${color}`}>₨{value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
  );
}

export default function Analytics() {
  const [period, setPeriod] = useState<"monthly" | "quarterly" | "yearly">("monthly");

  const { data: cashflow, isLoading: isLoadingCashflow } = useGetCashflow({ period }, { query: { queryKey: getGetCashflowQueryKey({ period }) } });
  const { data: incomeStatement, isLoading: isLoadingIS } = useGetIncomeStatement({ period }, { query: { queryKey: getGetIncomeStatementQueryKey({ period }) } });
  const { data: products } = useListProducts({}, { query: { queryKey: getListProductsQueryKey({}) } });
  const { data: inventory } = useListInventory({ view: "tablets" }, { query: { queryKey: getListInventoryQueryKey({ view: "tablets" }) } });

  // Compute inventory valuation per product
  const inventoryValuation = (products ?? []).map(p => {
    const batches = (inventory ?? []).filter(b => b.productName === p.name);
    const remainingTablets = batches.reduce((s, b) => s + b.remainingTablets, 0);
    const costValue = remainingTablets * p.costPerUnit;
    const sellingValue = remainingTablets * p.sellingPricePerUnit;
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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">Financial performance and inventory insights.</p>
        </div>
        <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="quarterly">Quarterly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="pl" className="space-y-6">
        <TabsList className="bg-card border h-12">
          <TabsTrigger value="pl" className="h-10 px-6">Profit & Loss</TabsTrigger>
          <TabsTrigger value="cashflow" className="h-10 px-6">Cash Flow</TabsTrigger>
          <TabsTrigger value="inventory" className="h-10 px-6">Inventory Value</TabsTrigger>
        </TabsList>

        {/* ── Profit & Loss ── */}
        <TabsContent value="pl" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* P&L Statement */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Income Statement</CardTitle>
                <CardDescription>Revenue − COGS − Expenses = Net Profit</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingIS ? (
                  <div className="space-y-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                ) : (
                  <div className="divide-y">
                    <StatRow label="Revenue" value={revenue} sub="Total sales income" />
                    <StatRow label="Cost of Goods Sold (COGS)" value={cogs} sub="Cost of items sold" indent />
                    <div className="border-t-2 border-foreground/20">
                      <StatRow
                        label={`Gross Profit (${grossMarginPct}% margin)`}
                        value={grossProfit}
                        highlight={grossProfit >= 0 ? "profit" : "loss"}
                      />
                    </div>
                    <StatRow label="Operating Expenses" value={opex} sub="Rent, salaries, utilities…" indent />
                    <div className="border-t-2 border-foreground/20">
                      <StatRow
                        label={`Net Profit (${netMarginPct}% margin)`}
                        value={netProfit}
                        highlight={netProfit >= 0 ? "profit" : "loss"}
                      />
                    </div>
                    <div className="pt-4 flex gap-4">
                      <div className="flex items-center gap-1.5 text-sm">
                        {netProfit >= 0
                          ? <TrendingUp className="w-4 h-4 text-green-600" />
                          : <TrendingDown className="w-4 h-4 text-destructive" />}
                        <span className="text-muted-foreground">
                          {netProfit >= 0 ? "Profitable" : "Running at a loss"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Period trend chart */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Revenue vs Expenses — {period}</CardTitle>
                <CardDescription>Period-by-period breakdown</CardDescription>
              </CardHeader>
              <CardContent className="h-[340px]">
                {isLoadingIS ? (
                  <Skeleton className="w-full h-full" />
                ) : (incomeStatement?.periods ?? []).length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={incomeStatement!.periods} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `₨${v}`} />
                      <Tooltip formatter={(v: any) => `₨${Number(v).toFixed(2)}`} />
                      <Bar dataKey="revenue" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="Revenue" />
                      <Bar dataKey="expenses" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="Expenses" />
                      <Bar dataKey="profit" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Net Profit" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    No sales data yet. Make your first sale to see the chart.
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
                <CardTitle>Cash Flow — {period}</CardTitle>
                <CardDescription>Inflow (sales) vs Outflow (expenses + inventory purchases)</CardDescription>
              </CardHeader>
              <CardContent className="h-[350px]">
                {isLoadingCashflow ? (
                  <Skeleton className="w-full h-full" />
                ) : (cashflow?.periods ?? []).length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cashflow!.periods} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `₨${v}`} />
                      <Tooltip formatter={(v: any) => `₨${Number(v).toFixed(2)}`} />
                      <Bar dataKey="inflow" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="Inflow" />
                      <Bar dataKey="outflow" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="Outflow" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">No data yet</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Net Position</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                {isLoadingCashflow ? (
                  <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
                ) : (
                  <>
                    <div>
                      <p className="text-sm text-muted-foreground font-medium mb-1">Total Inflow</p>
                      <p className="text-2xl font-bold text-green-600">₨{(cashflow?.totalInflow ?? 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground font-medium mb-1">Total Outflow</p>
                      <p className="text-2xl font-bold text-destructive">₨{(cashflow?.totalOutflow ?? 0).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground mt-1">Includes expenses + inventory purchases</p>
                    </div>
                    <div className="pt-4 border-t">
                      <p className="text-sm text-muted-foreground font-medium mb-1">Net Cash Flow</p>
                      <p className={`text-2xl font-bold ${(cashflow?.netCashflow ?? 0) >= 0 ? "text-primary" : "text-destructive"}`}>
                        ₨{(cashflow?.netCashflow ?? 0).toFixed(2)}
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
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground font-medium">Total Value at Cost</p>
                <p className="text-2xl font-bold mt-1">₨{totalCostValue.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">What you paid for current stock</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground font-medium">Total Value at Selling Price</p>
                <p className="text-2xl font-bold text-primary mt-1">₨{totalSellingValue.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">Max revenue if all sold at retail</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground font-medium">Potential Gross Profit</p>
                <p className={`text-2xl font-bold mt-1 ${totalSellingValue - totalCostValue >= 0 ? "text-green-600" : "text-destructive"}`}>
                  ₨{(totalSellingValue - totalCostValue).toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {totalCostValue > 0 ? `${((totalSellingValue - totalCostValue) / totalCostValue * 100).toFixed(1)}% margin` : "No stock"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Per-product table */}
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
                      <TableCell className="text-right tabular-nums">₨{p.costValue.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums text-primary font-medium">₨{p.sellingValue.toFixed(2)}</TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${p.sellingValue - p.costValue >= 0 ? "text-green-600" : "text-destructive"}`}>
                        ₨{(p.sellingValue - p.costValue).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{p.margin.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                  {inventoryValuation.length > 0 && (
                    <TableRow className="bg-muted/30 font-semibold border-t-2">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{inventoryValuation.reduce((s, p) => s + p.remainingTablets, 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">₨{totalCostValue.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-primary">₨{totalSellingValue.toFixed(2)}</TableCell>
                      <TableCell className={`text-right ${totalSellingValue - totalCostValue >= 0 ? "text-green-600" : "text-destructive"}`}>
                        ₨{(totalSellingValue - totalCostValue).toFixed(2)}
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
