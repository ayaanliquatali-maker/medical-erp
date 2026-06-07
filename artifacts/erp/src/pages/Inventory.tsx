import { useState } from "react";
import {
  useListInventory, useReceiveInventory, useListProducts, useListVendors, useListAccounts,
  getListInventoryQueryKey, getListProductsQueryKey, getListVendorsQueryKey, getListAccountsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Boxes, Layers, Pill } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format, isBefore, addDays } from "date-fns";

export default function Inventory() {
  const [view, setView] = useState<"tablets" | "packs" | "boxes">("tablets");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    productId: "", unitType: "tablet" as "tablet" | "syrup", batchNumber: "", boxesPurchased: "", packsPerBox: "10",
    tabsPerPack: "10", costPerUnit: "", sellingPricePerUnit: "", sellingPricePerPack: "", sellingPricePerBox: "", expiryDate: "", vendorId: "", paymentAccountId: "", notes: "",
  });

  const { data: inventory, isLoading } = useListInventory({ view }, { query: { queryKey: getListInventoryQueryKey({ view }) } });
  const { data: products } = useListProducts({}, { query: { queryKey: getListProductsQueryKey({}) } });
  const { data: vendors } = useListVendors({}, { query: { queryKey: getListVendorsQueryKey({}) } });
  const { data: accounts } = useListAccounts({}, { query: { queryKey: getListAccountsQueryKey({}) } });
  const receiveInventory = useReceiveInventory();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const cashAccounts = accounts?.filter(a => a.type === "asset" || a.type === "liability") ?? [];

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleReceive = () => {
    if (!form.productId || !form.boxesPurchased || !form.costPerUnit || !form.sellingPricePerUnit || !form.expiryDate) {
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
        vendorId: form.vendorId ? Number(form.vendorId) : undefined,
        paymentAccountId: form.paymentAccountId ? Number(form.paymentAccountId) : undefined,
        notes: form.notes || undefined,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey({}) });
        setDialogOpen(false);
        setForm({ productId: "", unitType: "tablet", batchNumber: "", boxesPurchased: "", packsPerBox: "10", tabsPerPack: "10", costPerUnit: "", sellingPricePerUnit: "", sellingPricePerPack: "", sellingPricePerBox: "", expiryDate: "", vendorId: "", paymentAccountId: "", notes: "" });
        toast({ title: "Inventory received successfully" });
      },
      onError: () => toast({ title: "Failed to receive inventory", variant: "destructive" }),
    });
  };

  const getExpiryStatus = (expiryDateStr: string) => {
    const expiryDate = new Date(expiryDateStr);
    const now = new Date();
    if (isBefore(expiryDate, now)) return { label: "Expired", variant: "destructive" as const };
    if (isBefore(expiryDate, addDays(now, 90))) return { label: "Near Expiry", variant: "secondary" as const };
    return { label: "Safe", variant: "default" as const };
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground mt-1">Manage stock batches and expiry dates.</p>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? [...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {[...Array(6)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
              </TableRow>
            )) : inventory?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-32 text-muted-foreground">No inventory batches. Click "Receive Inventory" to add stock.</TableCell>
              </TableRow>
            ) : inventory?.map(batch => {
              const status = getExpiryStatus(batch.expiryDate);
              const remaining = view === "tablets" ? batch.remainingTablets : view === "packs" ? batch.remainingPacks : batch.remainingBoxes;
              const total = view === "tablets" ? batch.totalTablets : view === "packs" ? Math.floor(batch.totalTablets / batch.tabsPerPack) : batch.boxesPurchased;
              return (
                <TableRow key={batch.id}>
                  <TableCell className="font-medium">{batch.productName}</TableCell>
                  <TableCell>{batch.batchNumber || "-"}</TableCell>
                  <TableCell>{remaining} / {total} {view}</TableCell>
                  <TableCell className="text-right">₨{batch.costPerUnit.toFixed(2)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {format(new Date(batch.expiryDate), "MMM d, yyyy")}
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                  </TableCell>
                  <TableCell>{batch.vendorName || "-"}</TableCell>
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
                  {products?.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Unit Type *</Label>
                <Select value={form.unitType} onValueChange={v => setForm(f => ({ ...f, unitType: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tablet">Tablet</SelectItem>
                    <SelectItem value="syrup">Syrup</SelectItem>
                  </SelectContent>
                </Select>
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
                <Label>Boxes Purchased *</Label>
                <Input type="number" value={form.boxesPurchased} onChange={set("boxesPurchased")} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label>Packs per Box</Label>
                <Input type="number" value={form.packsPerBox} onChange={set("packsPerBox")} />
              </div>
              <div className="space-y-1">
                <Label>Tablets per Pack</Label>
                <Input type="number" value={form.tabsPerPack} onChange={set("tabsPerPack")} />
              </div>
              <div className="space-y-1">
                <Label>Cost per Tablet *</Label>
                <Input type="number" step="0.01" value={form.costPerUnit} onChange={set("costPerUnit")} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label>Selling Price / Tablet *</Label>
                <Input type="number" step="0.01" value={form.sellingPricePerUnit} onChange={set("sellingPricePerUnit")} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label>Selling Price / Pack</Label>
                <Input type="number" step="0.01" value={form.sellingPricePerPack} onChange={set("sellingPricePerPack")} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label>Selling Price / Box</Label>
                <Input type="number" step="0.01" value={form.sellingPricePerBox} onChange={set("sellingPricePerBox")} placeholder="0.00" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Vendor</Label>
              <Select value={form.vendorId} onValueChange={v => setForm(f => ({ ...f, vendorId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select vendor (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {vendors?.map(v => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Payment Account</Label>
              <Select value={form.paymentAccountId} onValueChange={v => setForm(f => ({ ...f, paymentAccountId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select payment account (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
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
    </div>
  );
}
