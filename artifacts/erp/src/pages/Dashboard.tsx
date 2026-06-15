import { useState, useEffect, useMemo } from "react";
import { useGetDashboardStats, useGetIncomeStatement, useGetCashflow, useGetTopProducts, useGetExpenseAnalytics, useListProducts, useListInventory, useListAccounts, useGetInventoryAlerts, getGetDashboardStatsQueryKey, getGetIncomeStatementQueryKey, getGetCashflowQueryKey, getGetTopProductsQueryKey, getGetExpenseAnalyticsQueryKey, getListProductsQueryKey, getListInventoryQueryKey, getListAccountsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, PieChart, Pie, Cell, Legend } from "recharts";
import { useCurrency } from "@/hooks/use-currency";
import { ShoppingCart, DollarSign, TrendingUp, TrendingDown, PackageOpen, AlertTriangle, Settings2, Plus, X, GripVertical, PieChart as PieChartIcon, BarChart3, Table2, LineChart as LineChartIcon, Wallet, Boxes, ChevronLeft, ChevronRight, PiggyBank } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CURRENT_YEAR = new Date().getFullYear();
const STORAGE_KEY = "dashboard-widgets";

type PeriodMode = "current-month" | "custom-month" | "custom-day" | "quarter" | "year";
type ChartPeriod = "daily" | "monthly" | "quarterly" | "yearly";

type WidgetConfig = {
  id: string;
  type: string;
  title: string;
  visible: boolean;
  settings: Record<string, any>;
};

type WidgetType = {
  type: string;
  label: string;
  icon: any;
  defaultTitle: string;
  defaultSettings: Record<string, any>;
};

const WIDGET_TYPES: WidgetType[] = [
  { type: "profit-loss", label: "Profit & Loss", icon: TrendingUp, defaultTitle: "Profit & Loss", defaultSettings: { periodMode: "current-month" as PeriodMode } },
  { type: "cashflow", label: "Cash Flow", icon: Wallet, defaultTitle: "Cash Flow", defaultSettings: { periodMode: "current-month" as PeriodMode } },
  { type: "inventory-value", label: "Inventory Valuation", icon: Boxes, defaultTitle: "Inventory Valuation", defaultSettings: { periodMode: "current-month" as PeriodMode } },
  { type: "top-products", label: "Top Selling Products", icon: PieChartIcon, defaultTitle: "Top Selling Products", defaultSettings: { count: 5 } },
  { type: "trend", label: "Revenue & Profit Trend", icon: LineChartIcon, defaultTitle: "Revenue & Profit Trend", defaultSettings: { period: "monthly" as ChartPeriod, years: [CURRENT_YEAR] } },
  { type: "expenses", label: "Expenses by Category", icon: BarChart3, defaultTitle: "Expenses by Category", defaultSettings: { period: "monthly" as ChartPeriod, year: CURRENT_YEAR } },
  { type: "closing-balances", label: "Closing Balances", icon: Table2, defaultTitle: "Closing Balances", defaultSettings: { periodMode: "current-month" as PeriodMode } },
];

function loadWidgets(): WidgetConfig[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return WIDGET_TYPES.map((w, i) => ({
    id: `${w.type}-${i}`,
    type: w.type,
    title: w.defaultTitle,
    visible: true,
    settings: { ...w.defaultSettings },
  }));
}

function PeriodSetting({ value, onChange, label = "Period" }: { value: PeriodMode; onChange: (v: PeriodMode) => void; label?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={(v: PeriodMode) => onChange(v)}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="current-month">Current Month</SelectItem>
          <SelectItem value="custom-month">Custom Month</SelectItem>
          <SelectItem value="custom-day">Custom Day</SelectItem>
          <SelectItem value="quarter">Quarter</SelectItem>
          <SelectItem value="year">Year</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function getPeriodParams(settings: Record<string, any>, forcedPeriod?: string) {
  const mode: PeriodMode = settings.periodMode ?? "current-month";
  const now = new Date();
  if (mode === "custom-month") {
    const m = settings.customMonth ?? now.getMonth() + 1;
    const y = settings.customYear ?? now.getFullYear();
    return { period: forcedPeriod ?? "monthly", year: y, month: m };
  }
  if (mode === "custom-day") {
    const d = settings.customDay ?? now.getDate();
    const m = settings.customDayMonth ?? now.getMonth() + 1;
    const y = settings.customDayYear ?? now.getFullYear();
    return { period: forcedPeriod ?? "daily", year: y, month: m, day: d };
  }
  if (mode === "quarter") {
    const q = settings.quarter ?? Math.floor(now.getMonth() / 3) + 1;
    const y = settings.quarterYear ?? now.getFullYear();
    return { period: forcedPeriod ?? "quarterly", year: y, quarter: q };
  }
  if (mode === "year") {
    const y = settings.year ?? now.getFullYear();
    return { period: forcedPeriod ?? "yearly", year: y };
  }
  // current month
  return { period: forcedPeriod ?? "monthly", year: now.getFullYear(), month: now.getMonth() + 1 };
}

function usePeriodParams(settings: Record<string, any>, forcedPeriod?: string) {
  return useMemo(() => getPeriodParams(settings, forcedPeriod), [settings, forcedPeriod]);
}

function addMonths(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

function getMonthsInRange(from: string, to: string): string[] {
  const result: string[] = [];
  let current = new Date(from);
  const end = new Date(to);
  while (current <= end) {
    result.push(current.toISOString().slice(0, 7));
    current.setMonth(current.getMonth() + 1);
  }
  return result;
}

export default function Dashboard() {
  const { fmt, symbol } = useCurrency();
  const [widgets, setWidgets] = useState<WidgetConfig[]>(() => loadWidgets());
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [capitalOpen, setCapitalOpen] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  const { data: alerts } = useGetInventoryAlerts({ query: { refetchInterval: 60000 } });

  const activeAlerts = useMemo(() => {
    const items: { type: "expired" | "near-expiry"; label: string; batch: string }[] = [];
    if (!alerts) return items;
    for (const b of alerts.expired ?? []) {
      items.push({ type: "expired", label: `${b.productName} expired`, batch: b.batchNumber ?? "" });
    }
    for (const b of alerts.nearExpiry ?? []) {
      const daysLeft = Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / 86400000);
      items.push({ type: "near-expiry", label: `${b.productName} expires in ${daysLeft}d`, batch: b.batchNumber ?? "" });
    }
    return items.filter(i => !dismissedAlerts.includes(i.label));
  }, [alerts, dismissedAlerts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets]);

  const visibleWidgets = widgets.filter(w => w.visible);

  const updateWidget = (id: string, upd: Partial<WidgetConfig>) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, ...upd } : w));
  };

  const addWidget = (type: string) => {
    const wt = WIDGET_TYPES.find(w => w.type === type);
    if (!wt) return;
    const newWidget: WidgetConfig = {
      id: `${type}-${Date.now()}`,
      type,
      title: wt.defaultTitle,
      visible: true,
      settings: { ...wt.defaultSettings },
    };
    setWidgets(prev => [...prev, newWidget]);
  };

  const removeWidget = (id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id));
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Customizable store overview</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCapitalOpen(true)}>
            <PiggyBank className="w-4 h-4 mr-2" /> Add Capital
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCustomizeOpen(true)}>
            <Settings2 className="w-4 h-4 mr-2" /> Customize
          </Button>
        </div>
      </div>

      {activeAlerts.length > 0 && (
        <div className="space-y-2">
          {activeAlerts.map(a => (
            <div key={a.label} className={`flex items-center justify-between px-4 py-2.5 rounded-lg text-sm ${
              a.type === "expired"
                ? "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
                : "bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"
            }`}>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="font-medium">{a.label}</span>
                {a.batch && <span className="text-xs opacity-70">({a.batch})</span>}
              </div>
              <button onClick={() => setDismissedAlerts(p => [...p, a.label])} className="text-current opacity-50 hover:opacity-100 ml-2">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {visibleWidgets.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Settings2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No widgets added. Click Customize to add cards.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {visibleWidgets.map(w => (
            <WidgetCard
              key={w.id}
              widget={w}
              onSettings={() => setSettingsFor(w.id)}
              onRemove={() => removeWidget(w.id)}
              fmt={fmt}
              symbol={symbol}
            />
          ))}
        </div>
      )}

      {/* Customize Dialog */}
      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Customize Dashboard</DialogTitle>
            <DialogDescription>Add, remove, or reorder widgets.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {WIDGET_TYPES.map(wt => {
              const added = widgets.find(w => w.type === wt.type);
              return (
                <div key={wt.type} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <wt.icon className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{wt.label}</p>
                      <p className="text-xs text-muted-foreground">Add to dashboard</p>
                    </div>
                  </div>
                  {added ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">Added</Badge>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeWidget(added.id)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => { addWidget(wt.type); }}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button onClick={() => setCustomizeOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

{capitalOpen && <AddCapitalDialog onClose={() => setCapitalOpen(false)} />}

      {/* Per-widget Settings Dialog */}
      {settingsFor && (
        <WidgetSettings
          widget={widgets.find(w => w.id === settingsFor)!}
          onSave={(settings) => { updateWidget(settingsFor, { settings }); setSettingsFor(null); }}
          onClose={() => setSettingsFor(null)}
        />
      )}
    </div>
  );
}

function AddCapitalDialog({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: accounts } = useListAccounts({}, { query: { queryKey: getListAccountsQueryKey({}) } });
  const cashAccounts = accounts?.filter(a => a.type === "asset" && (a.code?.startsWith("1") || a.type === "asset")) ?? [];

  const handleSubmit = async () => {
    if (!amount || !cashAccountId) {
      toast({ title: "Fill in all fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/capital/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(amount),
          cashAccountId: parseInt(cashAccountId, 10),
          date: date || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to add capital");
      }
      toast({ title: "Capital added successfully" });
      queryClient.invalidateQueries({ queryKey: [getListAccountsQueryKey({})] });
      onClose();
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Capital</DialogTitle>
          <DialogDescription>Record owner capital contribution to increase cash balance</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Cash Account</Label>
            <Select value={cashAccountId} onValueChange={setCashAccountId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {cashAccounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Amount</Label>
            <Input type="number" min={1} step={0.01} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Adding..." : "Add Capital"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getSettingsPeriodLabel(settings: Record<string, any>): string {
  const mode = settings.periodMode ?? "current-month";
  const now = new Date();
  if (mode === "current-month") {
    return `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  }
  if (mode === "custom-month") {
    const m = settings.customMonth ?? now.getMonth() + 1;
    const y = settings.customYear ?? now.getFullYear();
    return `${MONTHS[m - 1]} ${y}`;
  }
  if (mode === "custom-day") {
    const d = settings.customDay ?? now.getDate();
    const m = settings.customDayMonth ?? now.getMonth() + 1;
    const y = settings.customDayYear ?? now.getFullYear();
    return `${MONTHS[m - 1]} ${d}, ${y}`;
  }
  if (mode === "quarter") {
    const q = settings.quarter ?? Math.floor(now.getMonth() / 3) + 1;
    const y = settings.quarterYear ?? now.getFullYear();
    return `Q${q} ${y}`;
  }
  if (mode === "year") {
    return String(settings.year ?? now.getFullYear());
  }
  return "";
}

function WidgetCard({ widget, onSettings, onRemove, fmt, symbol }: { widget: WidgetConfig; onSettings: () => void; onRemove: () => void; fmt: (v: number) => string; symbol: string }) {
  const periodLabel = ["profit-loss", "cashflow", "inventory-value", "closing-balances"].includes(widget.type)
    ? getSettingsPeriodLabel(widget.settings)
    : widget.type === "trend" || widget.type === "expenses"
    ? `${widget.settings.period ?? "monthly"} · ${widget.settings.year ?? new Date().getFullYear()}`
    : null;
  return (
    <Card className="relative group">
      <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-7 w-7 bg-background/80 backdrop-blur-sm" onClick={onSettings}>
          <Settings2 className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 bg-background/80 backdrop-blur-sm text-destructive" onClick={onRemove}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">{widget.title}</CardTitle>
        {periodLabel && <p className="text-xs text-muted-foreground mt-0.5">{periodLabel}</p>}
      </CardHeader>
      <CardContent>
        <WidgetBody widget={widget} fmt={fmt} symbol={symbol} />
      </CardContent>
    </Card>
  );
}

function WidgetBody({ widget, fmt, symbol }: { widget: WidgetConfig; fmt: (v: number) => string; symbol: string }) {
  const params = usePeriodParams(widget.settings);

  switch (widget.type) {
    case "profit-loss":
      return <ProfitLossWidget params={params} fmt={fmt} />;
    case "cashflow":
      return <CashflowWidget params={params} fmt={fmt} sf={symbol} />;
    case "inventory-value":
      return <InventoryValueWidget params={params} fmt={fmt} />;
    case "top-products":
      return <TopProductsWidget count={widget.settings.count ?? 5} fmt={fmt} />;
    case "trend":
      return <TrendWidget settings={widget.settings} fmt={fmt} />;
    case "expenses":
      return <ExpenseWidget settings={widget.settings} fmt={fmt} />;
    case "closing-balances":
      return <ClosingBalancesWidget params={params} fmt={fmt} sf={symbol} />;
    default:
      return <div className="text-sm text-muted-foreground">Unknown widget type</div>;
  }
}

function WidgetSettings({ widget, onSave, onClose }: { widget: WidgetConfig; onSave: (settings: Record<string, any>) => void; onClose: () => void }) {
  const [settings, setSettings] = useState({ ...widget.settings });
  const wt = WIDGET_TYPES.find(w => w.type === widget.type);

  const set = (k: string, v: any) => setSettings(prev => ({ ...prev, [k]: v }));

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Widget Settings</DialogTitle>
          <DialogDescription>{widget.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {widget.type === "top-products" && (
            <div className="space-y-1">
              <Label className="text-xs">Number of Products</Label>
              <Input type="number" min={1} max={50} value={settings.count ?? 5} onChange={e => set("count", parseInt(e.target.value) || 5)} />
            </div>
          )}
          {widget.type === "trend" && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Period</Label>
                <Select value={settings.period ?? "monthly"} onValueChange={v => set("period", v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {settings.period === "yearly" && (
                <div className="space-y-1">
                  <Label className="text-xs">Years (comma-separated, e.g. 2025,2026)</Label>
                  <Input value={(settings.years ?? [CURRENT_YEAR]).join(",")} onChange={e => set("years", e.target.value.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n)))} />
                </div>
              )}
              {(settings.period === "daily" || settings.period === "monthly" || settings.period === "quarterly") && (
                <div className="space-y-1">
                  <Label className="text-xs">Year</Label>
                  <Select value={String(settings.year ?? CURRENT_YEAR)} onValueChange={v => set("year", parseInt(v))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i).map(y => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
          {(widget.type === "expenses") && (
            <div className="space-y-1">
              <Label className="text-xs">Period</Label>
              <Select value={settings.period ?? "monthly"} onValueChange={v => set("period", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {["profit-loss", "cashflow", "inventory-value", "closing-balances"].includes(widget.type) && (
            <>
              <PeriodSetting value={settings.periodMode ?? "current-month"} onChange={v => set("periodMode", v)} />
              {(settings.periodMode === "custom-month") && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Month</Label>
                    <Select value={String(settings.customMonth ?? (new Date().getMonth() + 1))} onValueChange={v => set("customMonth", parseInt(v))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Year</Label>
                    <Select value={String(settings.customYear ?? CURRENT_YEAR)} onValueChange={v => set("customYear", parseInt(v))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i).map(y => (
                          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              {(settings.periodMode === "custom-day") && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Day</Label>
                    <Input type="number" min={1} max={31} value={settings.customDay ?? new Date().getDate()} onChange={e => set("customDay", parseInt(e.target.value) || 1)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Month</Label>
                    <Select value={String(settings.customDayMonth ?? (new Date().getMonth() + 1))} onValueChange={v => set("customDayMonth", parseInt(v))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Year</Label>
                    <Select value={String(settings.customDayYear ?? CURRENT_YEAR)} onValueChange={v => set("customDayYear", parseInt(v))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i).map(y => (
                          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              {(settings.periodMode === "quarter") && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Quarter</Label>
                    <Select value={String(settings.quarter ?? 1)} onValueChange={v => set("quarter", parseInt(v))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4].map(q => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Year</Label>
                    <Select value={String(settings.quarterYear ?? CURRENT_YEAR)} onValueChange={v => set("quarterYear", parseInt(v))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i).map(y => (
                          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              {(settings.periodMode === "year") && (
                <div className="space-y-1">
                  <Label className="text-xs">Year</Label>
                  <Select value={String(settings.year ?? CURRENT_YEAR)} onValueChange={v => set("year", parseInt(v))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i).map(y => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(settings)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Widget Implementations ── */

function ProfitLossWidget({ params, fmt }: { params: Record<string, any>; fmt: (v: number) => string }) {
  const { data, isLoading } = useGetIncomeStatement(params, { query: { queryKey: getGetIncomeStatementQueryKey(params) } });
  if (isLoading || !data) return <Skeleton className="h-32 w-full" />;
  const p = data.periods?.[0];
  if (!p) return <div className="text-sm text-muted-foreground">No data for selected period</div>;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Revenue</span><span className="font-semibold tabular-nums">{fmt(p.revenue)}</span></div>
      <div className="flex justify-between text-sm"><span className="text-muted-foreground">COGS</span><span className="font-semibold tabular-nums text-amber-600">{fmt(p.cogs)}</span></div>
      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Expenses</span><span className="font-semibold tabular-nums text-destructive">{fmt(p.expenses)}</span></div>
      <div className="border-t pt-2 flex justify-between text-sm font-bold">
        <span>Net Profit</span>
        <span className={cn("tabular-nums", p.profit >= 0 ? "text-green-600" : "text-destructive")}>{fmt(p.profit)}</span>
      </div>
    </div>
  );
}

function CashflowWidget({ params, fmt, sf }: { params: Record<string, any>; fmt: (v: number) => string; sf: string }) {
  const { data, isLoading } = useGetCashflow(params, { query: { queryKey: getGetCashflowQueryKey(params) } });
  if (isLoading || !data) return <Skeleton className="h-32 w-full" />;
  const p = data.periods?.[0];
  if (!p) return <div className="text-sm text-muted-foreground">No data for selected period</div>;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Inflow</span><span className="font-semibold tabular-nums text-green-600">{fmt(p.inflow)}</span></div>
      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Outflow</span><span className="font-semibold tabular-nums text-destructive">{fmt(p.outflow)}</span></div>
      <div className="border-t pt-2 flex justify-between text-sm font-bold">
        <span>Net Cashflow</span>
        <span className={cn("tabular-nums", p.net >= 0 ? "text-green-600" : "text-destructive")}>{fmt(p.net)}</span>
      </div>
    </div>
  );
}

function InventoryValueWidget({ params, fmt }: { params: Record<string, any>; fmt: (v: number) => string }) {
  const { data: products } = useListProducts({}, { query: { queryKey: getListProductsQueryKey({}) } });
  const { data: inventory } = useListInventory({ view: "tablets" }, { query: { queryKey: getListInventoryQueryKey({ view: "tablets" }) } });
  const yearStr = String(params.year ?? CURRENT_YEAR);

  const filtered = useMemo(() => {
    let list = Array.isArray(inventory) ? inventory : [];
    if (params.day && params.month) {
      const dd = String(params.day).padStart(2, "0");
      const mm = String(params.month).padStart(2, "0");
      list = list.filter(b => (b.receivedAt ?? "").startsWith(`${yearStr}-${mm}-${dd}`));
    } else if (params.month) {
      const mm = String(params.month).padStart(2, "0");
      list = list.filter(b => (b.receivedAt ?? "").startsWith(`${yearStr}-${mm}`) || (b.receivedAt ?? "").startsWith(yearStr));
    } else if (params.quarter) {
      const start = (params.quarter - 1) * 3 + 1;
      const end = params.quarter * 3;
      list = list.filter(b => {
        const m = parseInt((b.receivedAt ?? "").slice(5, 7), 10);
        return m >= start && m <= end;
      });
    } else {
      list = list.filter(b => (b.receivedAt ?? "").startsWith(yearStr));
    }
    return list;
  }, [inventory, params, yearStr]);

  const valuation = useMemo(() => {
    let remaining = 0, costValue = 0, sellValue = 0;
    for (const b of filtered) {
      remaining += b.remainingTablets;
      costValue += b.remainingTablets * b.costPerUnit;
      sellValue += b.remainingTablets * b.sellingPricePerUnit;
    }
    return { remaining, costValue, sellValue };
  }, [filtered]);

  if (!products || !inventory) return <Skeleton className="h-24 w-full" />;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Stock (units)</span><span className="font-semibold tabular-nums">{valuation.remaining}</span></div>
      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Cost Value</span><span className="font-semibold tabular-nums">{fmt(valuation.costValue)}</span></div>
      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Selling Value</span><span className="font-semibold tabular-nums text-green-600">{fmt(valuation.sellValue)}</span></div>
    </div>
  );
}

const PIE_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(330, 80%, 60%)", "hsl(200, 80%, 60%)", "hsl(160, 80%, 60%)", "hsl(280, 80%, 60%)", "hsl(30, 80%, 60%)"];

function TopProductsWidget({ count, fmt }: { count: number; fmt: (v: number) => string }) {
  const { data, isLoading } = useGetTopProducts({ limit: count }, { query: { queryKey: getGetTopProductsQueryKey({ limit: count }) } });
  if (isLoading || !data) return <Skeleton className="h-52 w-full" />;
  const items = data.topSelling?.slice(0, count) ?? [];
  if (items.length === 0) return <div className="text-sm text-muted-foreground text-center py-8">No sales data yet</div>;
  const total = items.reduce((s, i) => s + i.revenue, 0);
  return (
    <div className="space-y-2">
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={items} dataKey="revenue" nameKey="productName" cx="50%" cy="50%" outerRadius={70} innerRadius={40} label={({ productName, percent }) => `${(percent * 100).toFixed(0)}%`}>
              {items.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: number) => fmt(v)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1 text-xs">
        {items.map((p, i) => (
          <div key={p.productId} className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
              <span className="text-muted-foreground truncate max-w-[140px]">{p.productName}</span>
            </div>
            <span className="font-medium tabular-nums">{fmt(p.revenue)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendWidget({ settings, fmt }: { settings: Record<string, any>; fmt: (v: number) => string }) {
  const period: ChartPeriod = settings.period ?? "monthly";
  const years: number[] = settings.years ?? [CURRENT_YEAR];
  const year = settings.year ?? CURRENT_YEAR;

  // Build params for each year
  const paramsList = useMemo(() => {
    if (period === "yearly") {
      return years.map(y => ({ period, year: y }));
    }
    return [{ period, year }];
  }, [period, years, year]);

  const { data, isLoading } = useGetIncomeStatement(paramsList[0], {
    query: { queryKey: getGetIncomeStatementQueryKey(paramsList[0]) },
  });

  if (isLoading || !data) return <Skeleton className="h-52 w-full" />;
  const periods = data.periods ?? [];
  if (periods.length === 0) return <div className="text-sm text-muted-foreground text-center py-8">No data</div>;

  const chartData = periods.map(p => ({
    label: p.label,
    Revenue: p.revenue,
    "Net Profit": p.profit,
  }));

  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(Number(v))} />
          <Tooltip formatter={(v: number) => fmt(v)} />
          <Line type="monotone" dataKey="Revenue" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="Net Profit" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ExpenseWidget({ settings, fmt }: { settings: Record<string, any>; fmt: (v: number) => string }) {
  const period: ChartPeriod = settings.period ?? "monthly";
  const year = settings.year ?? CURRENT_YEAR;
  const { data, isLoading } = useGetExpenseAnalytics({ period, year }, { query: { queryKey: getGetExpenseAnalyticsQueryKey({ period, year }) } });
  if (isLoading || !data) return <Skeleton className="h-52 w-full" />;
  const items = (Array.isArray(data.byAccount) ? data.byAccount : []).filter(a => a.amount > 0);
  if (items.length === 0) return <div className="text-sm text-muted-foreground text-center py-8">No expenses for this period</div>;
  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={items} layout="vertical" margin={{ left: 80 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => fmt(Number(v))} />
          <YAxis type="category" dataKey="accountName" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={80} />
          <Tooltip formatter={(v: number) => fmt(v)} />
          <Bar dataKey="amount" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function InventoryDrillDown({ inventory, fmt, year, month, quarter }: { inventory: any[]; fmt: (v: number) => string; year: number; month?: number; quarter?: number }) {
  const [open, setOpen] = useState(false);

  const products = useMemo(() => {
    if (!Array.isArray(inventory)) return [];
    const map = new Map<string, { productName: string; totalUnits: number; totalCost: number; totalSell: number }>();
    for (const b of inventory) {
      const r = b.receivedAt ?? "";
      if (!r.startsWith(String(year))) continue;
      if (month) {
        const m = parseInt(r.slice(5, 7), 10);
        if (m > month) continue;
      }
      if (quarter) {
        const m = parseInt(r.slice(5, 7), 10);
        const q = Math.ceil(m / 3);
        if (q > quarter) continue;
      }
      const existing = map.get(b.productName) ?? { productName: b.productName, totalUnits: 0, totalCost: 0, totalSell: 0 };
      existing.totalUnits += b.remainingTablets;
      existing.totalCost += b.remainingTablets * b.costPerUnit;
      existing.totalSell += b.remainingTablets * b.sellingPricePerUnit;
      map.set(b.productName, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.totalUnits - a.totalUnits);
  }, [inventory, year, month, quarter]);

  const prefix = month
    ? `${MONTHS[month - 1]} ${year}`
    : quarter
    ? `Q${quarter} ${year}`
    : String(year);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="w-full flex justify-between items-center hover:bg-muted/50 rounded px-1 -mx-1 transition-colors cursor-pointer">
        <span className="text-muted-foreground">Inventory Value</span>
        <span className="font-semibold tabular-nums">{fmt(products.reduce((s, p) => s + p.totalCost, 0))} ({products.reduce((s, p) => s + p.totalUnits, 0)} units)</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Closing Inventory</DialogTitle>
            <DialogDescription>Stock remaining as of {prefix}</DialogDescription>
          </DialogHeader>
          {products.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No inventory for {prefix}</div>
          ) : (
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-medium text-muted-foreground px-1 pb-2 border-b">
                <span>Product</span>
                <div className="flex gap-6">
                  <span className="w-20 text-right">Units</span>
                  <span className="w-24 text-right">Cost Value</span>
                  <span className="w-24 text-right">Sell Value</span>
                </div>
              </div>
              {products.map(p => (
                <div key={p.productName} className="flex justify-between items-center px-1 py-2 text-sm border-b last:border-0">
                  <span className="font-medium truncate max-w-[180px]">{p.productName}</span>
                  <div className="flex gap-6">
                    <span className="w-20 text-right tabular-nums">{p.totalUnits}</span>
                    <span className="w-24 text-right tabular-nums">{fmt(p.totalCost)}</span>
                    <span className="w-24 text-right tabular-nums text-green-600">{fmt(p.totalSell)}</span>
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center px-1 py-2 text-sm font-bold border-t-2 mt-2">
                <span>Total</span>
                <div className="flex gap-6">
                  <span className="w-20 text-right tabular-nums">{products.reduce((s, p) => s + p.totalUnits, 0)}</span>
                  <span className="w-24 text-right tabular-nums">{fmt(products.reduce((s, p) => s + p.totalCost, 0))}</span>
                  <span className="w-24 text-right tabular-nums text-green-600">{fmt(products.reduce((s, p) => s + p.totalSell, 0))}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ClosingBalancesWidget({ params, fmt, sf }: { params: Record<string, any>; fmt: (v: number) => string; sf: string }) {
  const now = new Date();
  const year: number = (params as any).year ?? now.getFullYear();
  const month: number | undefined = (params as any).month;
  const quarter: number | undefined = (params as any).quarter;

  // Fetch data for cumulative period (Jan to selected month)
  const isMonthly = useGetIncomeStatement({ period: "monthly", year }, { query: { queryKey: getGetIncomeStatementQueryKey({ period: "monthly", year }) } });
  const cfMonthly = useGetCashflow({ period: "monthly", year }, { query: { queryKey: getGetCashflowQueryKey({ period: "monthly", year }) } });
  const { data: inventory } = useListInventory({ view: "tablets" }, { query: { queryKey: getListInventoryQueryKey({ view: "tablets" }) } });

  const cumulative = useMemo(() => {
    if (!isMonthly.data?.periods) return null;
    let rev = 0, cogs = 0, exp = 0;
    for (const p of isMonthly.data.periods) {
      const labelMonth = MONTHS.indexOf(p.label.split(" ")[0]) + 1;
      if (!labelMonth) continue;
      if (month && labelMonth > month) break;
      if (quarter) {
        const q = Math.ceil(labelMonth / 3);
        if (q > quarter) break;
      }
      rev += p.revenue;
      cogs += p.cogs;
      exp += p.expenses;
    }
    return { revenue: rev, cogs, expenses: exp, profit: rev - cogs - exp };
  }, [isMonthly.data, month, quarter]);

  const cashBal = useMemo(() => {
    if (!cfMonthly.data?.periods) return 0;
    let inflow = 0, outflow = 0;
    for (const p of cfMonthly.data.periods) {
      const labelMonth = MONTHS.indexOf(p.label.split(" ")[0]) + 1;
      if (!labelMonth) continue;
      if (month && labelMonth > month) break;
      if (quarter) {
        const q = Math.ceil(labelMonth / 3);
        if (q > quarter) break;
      }
      inflow += p.inflow;
      outflow += p.outflow;
    }
    return inflow - outflow;
  }, [cfMonthly.data, month, quarter]);

  if (!isMonthly.data || !cfMonthly.data || !inventory) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground">Cash Balance</span>
        <span className={cn("font-semibold tabular-nums", cashBal >= 0 ? "text-green-600" : "text-destructive")}>{fmt(cashBal)}</span>
      </div>
      <InventoryDrillDown inventory={inventory} fmt={fmt} year={year} month={month} quarter={quarter} />
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground">Sales (cumulative)</span>
        <span className="font-semibold tabular-nums text-green-600">{fmt(cumulative?.revenue ?? 0)}</span>
      </div>
      <div className="flex justify-between items-center border-t pt-2 font-bold">
        <span>Net Profit (cumulative)</span>
        <span className={cn("tabular-nums", (cumulative?.profit ?? 0) >= 0 ? "text-green-600" : "text-destructive")}>{fmt(cumulative?.profit ?? 0)}</span>
      </div>
    </div>
  );
}
