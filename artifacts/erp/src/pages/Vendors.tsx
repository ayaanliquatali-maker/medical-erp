import { useState } from "react";
import {
  useListVendors, useCreateVendor, useUpdateVendor, useDeleteVendor,
  getListVendorsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Edit, Trash } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/use-currency";

type VendorForm = { name: string; contactName: string; phone: string; email: string; address: string; notes: string };
const empty: VendorForm = { name: "", contactName: "", phone: "", email: "", address: "", notes: "" };

export default function Vendors() {
  const { fmt } = useCurrency();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<VendorForm>(empty);

  const { data: vendors, isLoading } = useListVendors({ search }, { query: { queryKey: getListVendorsQueryKey({ search }) } });
  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();
  const deleteVendor = useDeleteVendor();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey({}) });

  const openAdd = () => { setForm(empty); setEditingId(null); setDialogOpen(true); };
  const openEdit = (v: any) => {
    setForm({ name: v.name, contactName: v.contactName ?? "", phone: v.phone ?? "", email: v.email ?? "", address: v.address ?? "", notes: v.notes ?? "" });
    setEditingId(v.id); setDialogOpen(true);
  };

  const set = (k: keyof VendorForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = () => {
    if (!form.name.trim()) { toast({ title: "Vendor name is required", variant: "destructive" }); return; }
    const data = { name: form.name, contactName: form.contactName || undefined, phone: form.phone || undefined, email: form.email || undefined, address: form.address || undefined, notes: form.notes || undefined };
    if (editingId) {
      updateVendor.mutate({ id: editingId, data }, {
        onSuccess: () => { invalidate(); setDialogOpen(false); toast({ title: "Vendor updated" }); },
        onError: () => toast({ title: "Failed to update", variant: "destructive" }),
      });
    } else {
      createVendor.mutate({ data }, {
        onSuccess: () => { invalidate(); setDialogOpen(false); toast({ title: "Vendor added" }); },
        onError: () => toast({ title: "Failed to add vendor", variant: "destructive" }),
      });
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteVendor.mutate({ id: deleteId }, {
      onSuccess: () => { invalidate(); setDeleteId(null); toast({ title: "Vendor deleted" }); },
      onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
    });
  };

  const isPending = createVendor.isPending || updateVendor.isPending;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendors</h1>
          <p className="text-muted-foreground mt-1">Manage your suppliers and distributors.</p>
        </div>
        <Button onClick={openAdd}><Plus className="w-4 h-4 mr-2" />Add Vendor</Button>
      </div>

      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search vendors..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact Person</TableHead>
              <TableHead>Email / Phone</TableHead>
              <TableHead className="text-right">Total Purchases</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? [...Array(3)].map((_, i) => (
              <TableRow key={i}>{[...Array(5)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : vendors?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-32 text-muted-foreground">No vendors. Add your first vendor to get started.</TableCell>
              </TableRow>
            ) : vendors?.map(vendor => (
              <TableRow key={vendor.id}>
                <TableCell className="font-medium">{vendor.name}</TableCell>
                <TableCell>{vendor.contactName || "-"}</TableCell>
                <TableCell>
                  <div className="text-sm">{vendor.email || "-"}</div>
                  <div className="text-xs text-muted-foreground">{vendor.phone || "-"}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt(vendor.totalPurchases || 0)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(vendor)}><Edit className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteId(vendor.id)}><Trash className="w-4 h-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1">
              <Label>Vendor Name *</Label>
              <Input value={form.name} onChange={set("name")} placeholder="e.g. MedSupply Co." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Contact Person</Label>
                <Input value={form.contactName} onChange={set("contactName")} placeholder="Full name" />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={set("phone")} placeholder="+92 300 0000000" />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={set("email")} placeholder="vendor@example.com" />
              </div>
              <div className="space-y-1">
                <Label>Address</Label>
                <Input value={form.address} onChange={set("address")} placeholder="City, Country" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={set("notes")} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isPending}>{isPending ? "Saving…" : editingId ? "Save Changes" : "Add Vendor"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vendor?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the vendor record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
