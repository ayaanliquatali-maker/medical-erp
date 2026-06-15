import { useState } from "react";
import {
  useListProducts, useCreateSale, useListAccounts,
  getListProductsQueryKey, getListAccountsQueryKey, getListSalesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, Plus, Trash2, CheckCircle, Calculator } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/use-currency";

type LineItem = {
  productId: number;
  productName: string;
  genericName: string;
  unitType: string;
  quantity: number;
  qtyInput: string;
  unitPrice: number;
  amount: number;
  availStock: number;
  amountEdited: boolean;
};

export default function Sales() {
  const { fmt, symbol } = useCurrency();
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<LineItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [discount, setDiscount] = useState("0");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayStr());
  const [showConfirm, setShowConfirm] = useState(false);
  const [success, setSuccess] = useState<number | null>(null);
  const [addingLine, setAddingLine] = useState(false);

  const { data: products, isLoading } = useListProducts({ search }, { query: { queryKey: getListProductsQueryKey({ search }) } });
  const { data: accounts } = useListAccounts({}, { query: { queryKey: getListAccountsQueryKey({}) } });
  const createSale = useCreateSale();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const cashAccounts = accounts?.filter(a => a.type === "asset" && (a.code === "1000" || a.code === "1100")) ?? [];

  const addProductLine = (product: any) => {
    setLines(prev => {
      const existing = prev.findIndex(l => l.productId === product.id);
      if (existing >= 0) {
        const updated = [...prev];
        const item = updated[existing];
        const newQty = item.quantity + 1;
        updated[existing] = {
          ...item,
          quantity: newQty,
          qtyInput: String(newQty),
          amount: newQty * item.unitPrice,
        };
        return updated;
      }
      return [...prev, {
        productId: product.id,
        productName: product.name,
        genericName: product.genericName ?? "",
        unitType: "",
        quantity: 1,
        qtyInput: "1",
        unitPrice: product.sellingPricePerUnit,
        amount: product.sellingPricePerUnit,
        availStock: product.totalTablets ?? 0,
        amountEdited: false,
      }];
    });
  };

  const removeLine = (index: number) => setLines(prev => prev.filter((_, i) => i !== index));

  const updateLineQty = (index: number, raw: string) => {
    setLines(prev => prev.map((c, i) => {
      if (i !== index) return c;
      const parsed = parseInt(raw);
      const quantity = isNaN(parsed) || parsed < 1 ? c.quantity : parsed;
      if (c.amountEdited) {
        return { ...c, qtyInput: raw, quantity, unitPrice: quantity > 0 ? c.amount / quantity : c.unitPrice };
      }
      return { ...c, qtyInput: raw, quantity, amount: quantity * c.unitPrice };
    }));
  };

  const commitLineQty = (index: number) => {
    setLines(prev => prev.map((c, i) => {
      if (i !== index) return c;
      const qty = Math.max(1, parseInt(c.qtyInput) || 1);
      if (c.amountEdited) {
        return { ...c, quantity: qty, qtyInput: String(qty), unitPrice: c.amount / qty };
      }
      return { ...c, quantity: qty, qtyInput: String(qty), amount: qty * c.unitPrice };
    }));
  };

  const updateLineUnitType = (index: number, unitType: string) => {
    setLines(prev => prev.map((c, i) => i === index ? { ...c, unitType } : c));
  };

  const updateLinePrice = (index: number, raw: string) => {
    const price = parseFloat(raw);
    if (isNaN(price)) return;
    setLines(prev => prev.map((c, i) => i === index
      ? { ...c, unitPrice: price, amount: c.quantity * price, amountEdited: false } : c));
  };

  const updateLineAmount = (index: number, raw: string) => {
    const amount = parseFloat(raw);
    if (isNaN(amount)) return;
    setLines(prev => prev.map((c, i) => i === index
      ? { ...c, amount, unitPrice: c.quantity > 0 ? amount / c.quantity : c.unitPrice, amountEdited: true } : c));
  };

  const subtotal = lines.reduce((acc, l) => acc + l.amount, 0);
  const globalDiscount = Number(discount) || 0;
  const total = Math.max(0, subtotal - globalDiscount);

  const handleSave = () => {
    if (!paymentAccountId) { toast({ title: "Select a payment account", variant: "destructive" }); return; }
    if (lines.length === 0) { toast({ title: "No line items", variant: "destructive" }); return; }

    createSale.mutate({
      data: {
        date: new Date(transactionDate) as any,
        customerName: customerName || undefined,
        discount: globalDiscount || undefined,
        paymentAccountId: Number(paymentAccountId),
        lines: lines.map(l => ({
          productId: l.productId,
          unitType: l.unitType,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: 0,
        })),
      }
    }, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey({}) });
        queryClient.invalidateQueries({ queryKey: getListSalesQueryKey({}) });
        setSuccess(data.id);
        setLines([]);
        setCustomerName("");
        setDiscount("0");
        setPaymentAccountId("");
        setTransactionDate(todayStr());
        setShowConfirm(false);
      },
      onError: (err: any) => {
        const msg = err?.data?.error ?? err?.message ?? "Failed to process sale";
        toast({ title: msg, variant: "destructive" });
      },
    });
  };

  const productSelectOptions = (products ?? []).filter(
    p => !lines.some(l => l.productId === p.id)
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Sales Invoice</h1>
        <p className="text-sm text-muted-foreground mt-1">Create an invoice with inventory and accounting entries.</p>
      </div>

      <div className="flex flex-wrap items-start gap-4 bg-muted/30 border rounded-xl p-4">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">CUSTOMER NAME</label>
          <Input
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="Walk-in customer"
            className="bg-white border-muted-foreground/20"
          />
        </div>
        <div className="w-48">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">PAYMENT ACCOUNT</label>
          <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
            <SelectTrigger className="bg-white"><SelectValue placeholder="Select account" /></SelectTrigger>
            <SelectContent>
              {cashAccounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-36">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">DISCOUNT</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{symbol}</span>
            <Input type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} className="pl-7 bg-white" />
          </div>
        </div>
        <div className="w-40">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">DATE</label>
          <Input type="date" value={transactionDate} onChange={e => setTransactionDate(e.target.value)} className="bg-white" />
        </div>
      </div>

      <Card className="border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-[22%]">Item</th>
                <th className="py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-[14%]">Account</th>
                <th className="py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-[10%]">UOM</th>
                <th className="py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-[12%] text-right">Qty</th>
                <th className="py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-[16%] text-right">Unit Price</th>
                <th className="py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-[16%] text-right">Amount</th>
                <th className="py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-[10%]"></th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-muted-foreground">
                    <Calculator className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No items yet. Click "Add Item" or search products below.</p>
                  </td>
                </tr>
              ) : lines.map((line, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-sm">{line.productName}</div>
                    {line.genericName && <div className="text-xs text-muted-foreground">{line.genericName}</div>}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      Revenue
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <input
                      type="text"
                      className="h-8 w-20 bg-transparent border border-transparent hover:border-muted-foreground/20 focus:border-primary rounded-md px-2 text-xs outline-none"
                      value={line.unitType}
                      onChange={e => updateLineUnitType(i, e.target.value)}
                      placeholder="unit"
                    />
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <input
                      type="number"
                      className={`h-8 w-20 text-right bg-transparent border ${
                        line.quantity > line.availStock
                          ? "border-red-400 bg-red-50"
                          : "border-transparent hover:border-muted-foreground/20"
                      } focus:border-primary rounded-md px-2 text-sm outline-none ml-auto`}
                      value={line.qtyInput}
                      min={1}
                      onChange={e => updateLineQty(i, e.target.value)}
                      onBlur={() => commitLineQty(i)}
                    />
                    <div className={`text-[10px] mt-0.5 ${line.quantity > line.availStock ? "text-red-500" : "text-muted-foreground"}`}>
                      {line.quantity > line.availStock
                        ? `Exceeds stock (${line.availStock})`
                        : `${line.availStock} in stock`}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <input
                      type="number"
                      step="0.01"
                      className="h-8 w-24 text-right bg-white border border-muted-foreground/20 focus:border-primary rounded-md px-2 text-sm outline-none ml-auto"
                      value={line.unitPrice}
                      onChange={e => updateLinePrice(i, e.target.value)}
                      placeholder="0.00"
                    />
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <input
                      type="number"
                      step="0.01"
                      className="h-8 w-24 text-right font-semibold bg-white border border-muted-foreground/20 focus:border-primary rounded-md px-2 text-sm outline-none ml-auto tabular-nums"
                      value={line.amount}
                      onChange={e => updateLineAmount(i, e.target.value)}
                      placeholder="0.00"
                    />
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeLine(i)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-start justify-between gap-6">
        {/* Product search panel */}
        <Card className="flex-1 border shadow-sm max-w-lg">
          <CardContent className="p-0">
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search inventory..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
            </div>
            <ScrollArea className="max-h-64">
              {productSelectOptions.length === 0 && search && (
                <div className="p-6 text-center text-sm text-muted-foreground">No products match your search.</div>
              )}
              {isLoading ? (
                <div className="p-4 space-y-2">
                  {[1,2,3].map(i => <div key={i} className="h-9 bg-muted rounded animate-pulse" />)}
                </div>
              ) : (
                <div className="divide-y">
                  {productSelectOptions.map(p => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors flex items-center justify-between gap-2"
                      onClick={() => { addProductLine(p); setAddingLine(false); }}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.totalTablets ?? 0} in stock</div>
                      </div>
                      <div className="text-sm font-semibold text-primary shrink-0 tabular-nums">
                        {fmt(p.sellingPricePerUnit)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Totals panel */}
        <div className="w-64 space-y-3">
          <div className="bg-muted/30 border rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium tabular-nums">{fmt(subtotal)}</span>
            </div>
            {globalDiscount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount</span>
                <span className="tabular-nums">-{fmt(globalDiscount)}</span>
              </div>
            )}
            <div className="border-t pt-2 flex justify-between text-lg font-bold">
              <span>Total</span>
              <span className="text-primary tabular-nums">{fmt(total)}</span>
            </div>
          </div>

          <Button
            size="lg"
            className="w-full h-11 text-base font-medium"
            disabled={lines.length === 0}
            onClick={() => setShowConfirm(true)}
          >
            Review &amp; Save
          </Button>
        </div>
      </div>

      {/* Confirm dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Review Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {customerName && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium">{customerName}</span>
              </div>
            )}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b text-left">
                    <th className="py-2 px-3 font-medium text-xs">Item</th>
                    <th className="py-2 px-3 font-medium text-xs text-right">Qty</th>
                    <th className="py-2 px-3 font-medium text-xs text-right">Price</th>
                    <th className="py-2 px-3 font-medium text-xs text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 px-3">
                        <div>{l.productName}</div>
                        <div className="text-[10px] text-muted-foreground">{l.availStock} in stock</div>
                      </td>
                      <td className="py-2 px-3 text-right">{l.quantity} {l.unitType}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmt(l.unitPrice)}</td>
                      <td className="py-2 px-3 text-right font-medium tabular-nums">{fmt(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{fmt(subtotal)}</span></div>
              {globalDiscount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span className="tabular-nums">-{fmt(globalDiscount)}</span></div>}
              <div className="flex justify-between font-bold text-base border-t pt-1"><span>Total</span><span className="tabular-nums">{fmt(total)}</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createSale.isPending}>
              {createSale.isPending ? "Posting..." : "Post Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success dialog */}
      <Dialog open={!!success} onOpenChange={() => setSuccess(null)}>
        <DialogContent className="max-w-sm text-center">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Invoice Posted</h2>
              <p className="text-muted-foreground mt-1">Invoice #{success} has been recorded. Accounting entries created.</p>
            </div>
            <Button className="w-full" onClick={() => setSuccess(null)}>New Invoice</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
