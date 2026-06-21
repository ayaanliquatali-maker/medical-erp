import { useState, useEffect } from "react";
import {
  useListSalesReturns, useGetSaleReturn, useCreateSaleReturn,
  getListSalesReturnsQueryKey, getGetSaleReturnQueryKey,
  useListAccounts, useListSales, useGetSale,
  getListAccountsQueryKey, getListSalesQueryKey, getGetSaleQueryKey,
} from "@workspace/api-client-react";
import { useAdmin } from "@/context/admin";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/use-currency";
import { format } from "date-fns";
import { parseDate } from "@/lib/utils";

const today = () => new Date().toISOString().slice(0, 10);

type ReturnLine = {
  productId: number;
  productName: string;
  unitType: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};

export default function SalesReturn() {
  const { fmt } = useCurrency();
  const { isAdmin } = useAdmin();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewReturnId, setViewReturnId] = useState<number | null>(null);
  const [selectedSaleId, setSelectedSaleId] = useState<string>("");
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [paymentAccountId, setPaymentAccountId] = useState<string>("");
  const [returnDate, setReturnDate] = useState(today());
  const [reason, setReason] = useState("");
  const [lineQtyOverrides, setLineQtyOverrides] = useState<Record<number, string>>({});

  const { data: returns, isLoading } = useListSalesReturns({
    query: { queryKey: getListSalesReturnsQueryKey() },
  });
  const { data: viewReturn } = useGetSaleReturn(viewReturnId ?? 0, {
    query: { queryKey: getGetSaleReturnQueryKey(viewReturnId ?? 0), enabled: !!viewReturnId },
  });
  const { data: accounts } = useListAccounts({}, { query: { queryKey: getListAccountsQueryKey({}) } });
  const { data: sales } = useListSales({}, { query: { queryKey: getListSalesQueryKey({}) } });
  const { data: selectedSaleData } = useGetSale(Number(selectedSaleId), {
    query: { queryKey: getGetSaleQueryKey(Number(selectedSaleId)), enabled: !!selectedSaleId },
  });
  const createReturn = useCreateSaleReturn();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const cashAccounts = (Array.isArray(accounts) ? accounts : []).filter(a => a.type === "asset" && (a.code === "1000" || a.code === "1100"));

  const selectedSale = (Array.isArray(sales) ? sales : []).find((s: any) => s.id === Number(selectedSaleId));

  useEffect(() => {
    if (!selectedSaleId) return;
    const sale = selectedSaleData as any;
    if (!sale?.lines) return;
    setLines(sale.lines.map((l: any) => ({
      productId: l.productId,
      productName: l.productName,
      unitType: l.unitType,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: l.discount ?? 0,
    })));
    setLineQtyOverrides({});
    if (sale.paymentAccountId) setPaymentAccountId(String(sale.paymentAccountId));
  }, [selectedSaleId, selectedSaleData]);

  const updateLineQty = (idx: number, raw: string) => {
    setLineQtyOverrides(prev => ({ ...prev, [idx]: raw }));
  };

  const commitLineQty = (idx: number) => {
    const raw = lineQtyOverrides[idx];
    if (raw === undefined) return;
    const num = parseInt(raw, 10);
    const maxQty = lines[idx]?.quantity ?? 1;
    const clamped = isNaN(num) || num < 1 ? 1 : Math.min(num, maxQty);
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: clamped } : l));
    setLineQtyOverrides(prev => { const n = { ...prev }; delete n[idx]; return n; });
  };

  const updateLine = (idx: number, field: keyof ReturnLine, value: any) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice - l.discount, 0);

  const handleSubmit = () => {
    if (!selectedSaleId || !paymentAccountId || lines.length === 0) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    createReturn.mutate({
      saleId: Number(selectedSaleId),
      data: {
        date: returnDate,
        paymentAccountId: Number(paymentAccountId),
        reason: reason || undefined,
        lines: lines.map(l => ({
          productId: l.productId,
          unitType: l.unitType,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount || undefined,
        })),
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSalesReturnsQueryKey() });
        toast({ title: "Sales return created successfully" });
        setDialogOpen(false);
        resetForm();
      },
      onError: (err: any) => {
        toast({ title: err.message || "Failed to create return", variant: "destructive" });
      },
    });
  };

  const resetForm = () => {
    setSelectedSaleId("");
    setLines([]);
    setPaymentAccountId("");
    setReturnDate(today());
    setReason("");
    setLineQtyOverrides({});
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales Returns</h1>
          <p className="text-muted-foreground text-sm">Manage sales returns and refunds</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setDialogOpen(true)} size="sm">
            <Plus className="w-4 h-4 mr-1.5" /> New Return
          </Button>
        )}
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Return #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Original Sale</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}
                </TableRow>
              ))
            ) : (Array.isArray(returns) ? returns : []).length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No returns recorded</TableCell></TableRow>
            ) : (
              (Array.isArray(returns) ? returns : []).map((ret: any) => (
                <TableRow key={ret.id}>
                  <TableCell className="font-mono text-xs">{ret.returnNumber}</TableCell>
                  <TableCell>{format(parseDate(ret.date), "dd MMM yyyy")}</TableCell>
                  <TableCell className="font-mono text-xs">#{ret.originalSaleId}</TableCell>
                  <TableCell>{ret.customerName || "-"}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(ret.total)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{ret.reason || "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setViewReturnId(ret.id)}>View</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* New Return Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Sales Return</DialogTitle>
            <DialogDescription>Select a sale to auto-fill products, then adjust quantities</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label>Original Sale *</Label>
              <Select value={selectedSaleId} onValueChange={setSelectedSaleId}>
                <SelectTrigger><SelectValue placeholder="Select sale..." /></SelectTrigger>
                <SelectContent>
                  {(Array.isArray(sales) ? sales : []).map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      #{s.saleNumber} - {s.customerName || "Walk-in"} ({fmt(s.total)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Payment Account *</Label>
              <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                <SelectTrigger><SelectValue placeholder="Refund to..." /></SelectTrigger>
                <SelectContent>
                  {cashAccounts.map((a: any) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} />
            </div>
            <div>
              <Label>Reason</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional reason..." />
            </div>
          </div>

          {lines.length > 0 && (
            <div className="border rounded-lg mb-4">
              <div className="px-3 py-2 bg-muted/50 text-xs text-muted-foreground font-medium">
                Products from sale #{(selectedSale as any)?.saleNumber || selectedSaleId} — adjust quantities to return
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-24">Return Qty</TableHead>
                    <TableHead className="text-right w-28">Unit Price</TableHead>
                    <TableHead className="text-right w-24">Discount</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-sm font-medium">{line.productName}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={lineQtyOverrides[idx] ?? line.quantity}
                          onChange={e => updateLineQty(idx, e.target.value)}
                          onBlur={() => commitLineQty(idx)}
                          onKeyDown={e => { if (e.key === "Enter") commitLineQty(idx); }}
                          className="h-8 w-24"
                        />
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmt(line.unitPrice)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{line.discount > 0 ? `-${fmt(line.discount)}` : "-"}</TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {fmt(line.quantity * line.unitPrice - line.discount)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLine(idx)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="px-4 py-2 border-t flex justify-between text-sm">
                <span className="text-muted-foreground">{lines.length} item(s)</span>
                <span className="font-semibold">Total: {fmt(subtotal)}</span>
              </div>
            </div>
          )}

          {selectedSaleId && lines.length === 0 && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              Loading sale items...
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createReturn.isPending || lines.length === 0}>
              {createReturn.isPending ? "Processing..." : "Create Return"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Return Dialog */}
      <Dialog open={!!viewReturnId} onOpenChange={(open) => { if (!open) setViewReturnId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sales Return Details</DialogTitle>
          </DialogHeader>
          {viewReturn ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Return #:</span> <span className="font-mono">{viewReturn.returnNumber}</span></div>
                <div><span className="text-muted-foreground">Date:</span> {format(parseDate(viewReturn.date), "dd MMM yyyy")}</div>
                <div><span className="text-muted-foreground">Original Sale:</span> #{viewReturn.originalSaleId}</div>
                <div><span className="text-muted-foreground">Customer:</span> {viewReturn.customerName || "-"}</div>
                <div><span className="text-muted-foreground">Refund Account:</span> {viewReturn.paymentAccountName}</div>
                {viewReturn.reason && <div className="col-span-2"><span className="text-muted-foreground">Reason:</span> {viewReturn.reason}</div>}
              </div>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewReturn.lines.map((l: any) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-sm">{l.productName}</TableCell>
                        <TableCell className="text-sm">{l.quantity} {l.unitType}</TableCell>
                        <TableCell className="text-sm">{fmt(l.unitPrice)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{fmt(l.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end">
                <Badge variant="secondary" className="text-base">Total Refund: {fmt(viewReturn.total)}</Badge>
              </div>
            </div>
          ) : (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
