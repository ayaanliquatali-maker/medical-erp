import { useState } from "react";
import { Link } from "wouter";
import {
  useListInventory, useReceiveInventory, useListProducts, useListVendors, useListAccounts, useDeleteInventoryBatch,
  getListInventoryQueryKey, getListProductsQueryKey, getListVendorsQueryKey, getListAccountsQueryKey,
} from "@workspace/api-client-react";
import { useAdmin } from "@/context/admin";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Boxes, Layers, Pill, Trash2, Undo2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/use-currency";
import { format, isBefore, addDays } from "date-fns";
import { parseDate } from "@/lib/utils";

const today = () => new Date().toISOString().slice(0, 10);

export default function Inventory() {
  const { fmt } = useCurrency();
  const [view, setView] = useState<"tablets" | "packs" | "boxes">("tablets");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<number | null>(null);
  const [form, setForm] = useState({
    productId: "", unitType: "", batchNumber: "", boxesPurchased: "", packsPerBox: "10",
    tabsPerPack: "10", costPerUnit: "", sellingPricePerUnit: "", sellingPricePerPack: "", sellingPricePerBox: "", expiryDate: "", receivedAt: today(), vendorId: "", paymentAccountId: "", notes: "",
  });

  const { data: inventory, isLoading } = useListInventory({ view }, { query: { queryKey: getListInventoryQueryKey({ view }) } });
  const { data: products } = useListProducts({}, { query: { queryKey: getListProductsQueryKey({}) } });
  const { data: vendors } = useListVendors({}, { query: { queryKey: getListVendorsQueryKey({}) } });
  const { data: accounts } = useListAccounts({}, { query: { queryKey: getListAccountsQueryKey({}) } });
  const receiveInventory = useReceiveInventory();
  const deleteBatch = useDeleteInventoryBatch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAdmin();

  const cashAccounts = (Array.isArray(accounts) ? accounts : []).filter(a => a.type === "asset" || a.type === "liability");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handlePackPrice = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setForm(f => {
      const tabs = Number(f.tabsPerPack) || 1;
      const packPrice = Number(val) || 0;
      return {
        ...f,
        sellingPricePerPack: val,
        sellingPricePerUnit: packPrice > 0 && tabs > 0 ? String(packPrice / tabs) : f.sellingPricePerUnit,
      };
    });
  };

  const handleBoxPrice = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setForm(f => {
      const tabs = Number(f.tabsPerPack) || 1;
      const packs = Number(f.packsPerBox) || 1;
      const boxPrice = Number(val) || 0;
      return {
        ...f,
        sellingPricePerBox: val,
        sellingPricePerUnit: boxPrice > 0 && tabs > 0 && packs > 0 ? String(boxPrice / (tabs * packs)) : f.sellingPricePerUnit,
      };
    });
  };

  const handleReceive = () => {
    if (!form.productId || !form.boxesPurchased || !form.costPerUnit || !form.sellingPricePerUnit || !form.expiryDate || !form.paymentAccountId) {
      toast({ title: "Please fill required fields", variant: "destructive" }); return;
    }
    receiveInventory.mutate({
      data: {
        productId: Number(form.productId),
        unitType: form.unitType,
        batchNumber: form.batchNumber || undefined,
        boxesPurchased: Number(form.boxesPurchased),
        packsPerBox: Number(form.packsPerBox),
        tabsPerPack: Number(form.tabsPerPack),
        costPerUnit: Number(form.costPerUnit),
        sellingPricePerUnit: Number(form.sellingPricePerUnit),
        sellingPricePerPack: form.sellingPricePerPack ? Number(form.sellingPricePerPack) : undefined,
        sellingPricePerBox: form.sellingPricePerBox ? Number(form.sellingPricePerBox) : undefined,
        expiryDate: new Date(form.expiryDate) as any,
        receivedAt: new Date(form.receivedAt) as any,
        vendorId: form.vendorId ? Number(form.vendorId) : undefined,
        paymentAccountId: Number(form.paymentAccountId),
        notes: form.notes || undefined,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey({}) });
        setDialogOpen(false);
        setForm({ productId: "", unitType: "", batchNumber: "", boxesPurchased: "", packsPerBox: "10", tabsPerPack: "10", costPerUnit: "", sellingPricePerUnit: "", sellingPricePerPack: "", sellingPricePerBox: "", expiryDate: "", receivedAt: today(), vendorId: "", paymentAccountId: "", notes: "" });
        toast({ title: "Inventory received successfully" });
      },
      onError: (err: any) => {
        const msg = err?.data?.error ?? err?.message ?? "Failed to receive inventory";
        toast({ title: msg, variant: "destructive" });
      },
    });
  };

  const getExpiryStatus = (expiryDateStr: string) => {
    const expiryDate = parseDate(expiryDateStr);
    const now = new Date();
    if (isBefore(expiryDate, now)) return { label: "Expired", variant: "destructive" as const };
    if (isBefore(expiryDate, addDays(now, 90))) return { label: "Near Expiry", variant: "secondary" as const };
    return { label: "Safe", variant: "default" as const };
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage stock batches and expiry dates.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" />Receive Inventory</Button>
      </div>

      <div>
        <Select value={view} onValueChange={(val: any) => setView(val)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select view" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tablets"><div className="flex items-center gap-2"><Pill className="w-4 h-4" /> View as Tablets</div></SelectItem>
            <SelectItem value="packs"><div className="flex items-center gap-2"><Layers className="w-4 h-4" /> View as Packs</div></SelectItem>
            <SelectItem value="boxes"><div className="flex items-center gap-2"><Boxes className="w-4 h-4" /> View as Boxes</div></SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Received / Remaining</TableHead>
              <TableHead className="text-right">Cost / Unit</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? [...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {[...Array(6)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
              </TableRow>
            )) : (Array.isArray(inventory) ? inventory : []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-32 text-muted-foreground">No inventory batches. Click "Receive Inventory" to add stock.</TableCell>
              </TableRow>
            ) : (Array.isArray(inventory) ? inventory : []).map(batch => {
              const status = getExpiryStatus(batch.expiryDate);
              const remaining = view === "tablets" ? batch.remainingTablets : view === "packs" ? batch.remainingPacks : batch.remainingBoxes;
              const total = view === "tablets" ? batch.totalTablets : view === "packs" ? Math.floor(batch.totalTablets / Math.max(1, batch.tabsPerPack)) : batch.boxesPurchased;
              return (
                <TableRow key={batch.id}>
                  <TableCell className="font-medium">{batch.productName}</TableCell>
                  <TableCell>{batch.batchNumber || "-"}</TableCell>
                  <TableCell>{remaining} / {total} {view}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(batch.costPerUnit)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {format(parseDate(batch.expiryDate), "MMM d, yyyy")}
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                  </TableCell>
                  <TableCell>{batch.vendorName || "-"}</TableCell>
                  <TableCell className="text-right">
                    {isAdmin ? (
                      <div className="flex items-center justify-end gap-1">
                        <Link href="/purchase-return" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                            <Undo2 className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setBatchToDelete(batch.id); setDeleteDialogOpen(true); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Receive Inventory</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1">
              <Label>Product *</Label>
              <Select value={form.productId} onValueChange={v => setForm(f => ({ ...f, productId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {(Array.isArray(products) ? products : []).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Unit Type *</Label>
                <Input value={form.unitType} onChange={set("unitType")} placeholder="e.g. tablet, sachet, jar, bottle" />
              </div>
              <div className="space-y-1">
                <Label>Batch Number</Label>
                <Input value={form.batchNumber} onChange={set("batchNumber")} placeholder="e.g. BTH-2024-01" />
              </div>
              <div className="space-y-1">
                <Label>Expiry Date *</Label>
                <Input type="date" value={form.expiryDate} onChange={set("expiryDate")} />
              </div>
              <div className="space-y-1">
                <Label>Received Date *</Label>
                <Input type="date" value={form.receivedAt} onChange={set("receivedAt")} />
              </div>
              <div className="space-y-1">
                <Label>Boxes Purchased *</Label>
                <Input type="number" value={form.boxesPurchased} onChange={set("boxesPurchased")} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label>Packs per Box</Label>
                <Input type="number" value={form.packsPerBox} onChange={set("packsPerBox")} />
              </div>
              <div className="space-y-1">
                <Label>Total {form.unitType || "Unit"}</Label>
                <Input type="number" value={form.tabsPerPack} onChange={set("tabsPerPack")} />
              </div>
              <div className="space-y-1">
                <Label>Cost per {form.unitType || "Unit"} *</Label>
                <Input type="number" step="0.01" value={form.costPerUnit} onChange={set("costPerUnit")} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label>Selling Price / {form.unitType || "Unit"} *</Label>
                <Input type="number" step="0.01" value={form.sellingPricePerUnit} onChange={set("sellingPricePerUnit")} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label>Selling Price / Pack</Label>
                <Input type="number" step="0.01" value={form.sellingPricePerPack} onChange={handlePackPrice} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label>Selling Price / Box</Label>
                <Input type="number" step="0.01" value={form.sellingPricePerBox} onChange={handleBoxPrice} placeholder="0.00" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Vendor</Label>
              <Select value={form.vendorId} onValueChange={v => setForm(f => ({ ...f, vendorId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select vendor (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(Array.isArray(vendors) ? vendors : []).map(v => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Payment Account *</Label>
              <Select value={form.paymentAccountId} onValueChange={v => setForm(f => ({ ...f, paymentAccountId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select payment account" /></SelectTrigger>
                <SelectContent>
                  {cashAccounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={set("notes")} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleReceive} disabled={receiveInventory.isPending}>
              {receiveInventory.isPending ? "Saving…" : "Receive Inventory"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Inventory Batch</DialogTitle>
            <DialogDescription>Are you sure you want to delete this batch? This will also remove the associated journal entry. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if (batchToDelete !== null) {
                deleteBatch.mutate({ id: batchToDelete }, {
                  onSuccess: () => {
                    queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey({}) });
                    setDeleteDialogOpen(false);
                    setBatchToDelete(null);
                    toast({ title: "Inventory batch deleted" });
                  },
                  onError: (err: any) => {
                    const msg = err?.data?.error ?? err?.message ?? "Failed to delete batch";
                    toast({ title: msg, variant: "destructive" });
                  },
                });
              }
            }} disabled={deleteBatch.isPending}>
              {deleteBatch.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
