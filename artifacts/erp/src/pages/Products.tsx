import { useState } from "react";
import {
  useListProducts, useCreateProduct, useUpdateProduct, useDeleteProduct,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { useAdmin } from "@/context/admin";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Edit, Trash, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/use-currency";

type ProductForm = {
  name: string;
  genericName: string;
  category: string;
  reorderLevel: string;
};

const emptyForm: ProductForm = {
  name: "", genericName: "", category: "", reorderLevel: "50",
};

export default function Products() {
  const { fmt } = useCurrency();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);

  type StatusFilter = "all" | "active" | "inactive";
  type SortOption = "default" | "name" | "stockAsc" | "stockDesc";

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [stockFilter, setStockFilter] = useState<"all" | "lowStock">("all");
  const [sortOption, setSortOption] = useState<SortOption>("default");

  const { data: products, isLoading } = useListProducts({ search }, { query: { queryKey: getListProductsQueryKey({ search }) } });
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const productsList = Array.isArray(products) ? products : [];
  const productResponseInvalid = products != null && !Array.isArray(products);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAdmin();

  const isLowStock = (product: any) => product.totalTablets <= (product.reorderLevel ?? 0);

  const filteredProducts = productsList
    .filter(product => {
      if (statusFilter === "active") return product.isActive;
      if (statusFilter === "inactive") return !product.isActive;
      return true;
    })
    .filter(product => {
      if (stockFilter === "lowStock") return isLowStock(product);
      return true;
    })
    .sort((a, b) => {
      if (sortOption === "name") return a.name.localeCompare(b.name);
      if (sortOption === "stockAsc") return (a.totalTablets ?? 0) - (b.totalTablets ?? 0);
      if (sortOption === "stockDesc") return (b.totalTablets ?? 0) - (a.totalTablets ?? 0);

      const aActive = a.isActive ? 0 : 1;
      const bActive = b.isActive ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;

      const aLow = isLowStock(a) ? 0 : 1;
      const bLow = isLowStock(b) ? 0 : 1;
      if (aLow !== bLow) return aLow - bLow;

      return a.name.localeCompare(b.name);
    });

  const openAdd = () => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); };
  const openEdit = (p: any) => {
    setForm({
      name: p.name, genericName: p.genericName ?? "", category: p.category ?? "",
      reorderLevel: String(p.reorderLevel ?? 50),
    });
    setEditingId(p.id);
    setDialogOpen(true);
  };

  const set = (k: keyof ProductForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const invalidate = () => {
    queryClient.invalidateQueries({
      predicate: query => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/products",
      refetchInactive: true,
    });
  };

  const removeDeletedFromCache = (id: number) => {
    queryClient.getQueryCache().getAll().forEach(query => {
      if (!Array.isArray(query.queryKey) || query.queryKey[0] !== "/api/products") return;
      queryClient.setQueryData<any[]>(query.queryKey, current => current?.filter(item => item.id !== id) ?? current);
    });
  };

  const clearProductQueries = () => {
    queryClient.removeQueries({
      predicate: query => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/products",
      exact: false,
      silent: true,
    });
  };

  const handleSave = () => {
    const data = {
      name: form.name,
      genericName: form.genericName || undefined,
      category: form.category || undefined,
      reorderLevel: Number(form.reorderLevel) || 50,
    };
    if (!data.name) {
      toast({ title: "Product name is required", variant: "destructive" }); return;
    }
    if (editingId) {
      updateProduct.mutate({ id: editingId, data }, {
        onSuccess: () => { invalidate(); setDialogOpen(false); toast({ title: "Product updated" }); },
        onError: () => toast({ title: "Failed to update product", variant: "destructive" }),
      });
    } else {
      createProduct.mutate({ data }, {
        onSuccess: () => { invalidate(); setDialogOpen(false); toast({ title: "Product added" }); },
        onError: () => toast({ title: "Failed to add product", variant: "destructive" }),
      });
    }
  };

  const handleToggleActive = (product: any, nextState: boolean) => {
    updateProduct.mutate({ id: product.id, data: { isActive: nextState } }, {
      onSuccess: () => { invalidate(); toast({ title: nextState ? "Product activated" : "Product deactivated" }); },
      onError: () => toast({ title: "Failed to update product status", variant: "destructive" }),
    });
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      await deleteProduct.mutateAsync({ id: deleteId });
      removeDeletedFromCache(deleteId);
      clearProductQueries();
      setDeleteId(null);
      toast({ title: "Product deleted" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: `Failed to delete product: ${message}`, variant: "destructive" });
      console.error("Delete product failed:", error);
    } finally {
      invalidate();
      queryClient.refetchQueries({
        predicate: query => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/products",
        active: true,
      });
    }
  };

  const isPending = createProduct.isPending || updateProduct.isPending;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage medicines and store items.</p>
        </div>
        <Button onClick={openAdd} className="rounded-full shadow-sm"><Plus className="w-4 h-4" />Add Product</Button>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="min-w-[130px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={stockFilter} onValueChange={setStockFilter}>
            <SelectTrigger className="min-w-[130px] h-9">
              <SelectValue placeholder="Stock" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stock</SelectItem>
              <SelectItem value="lowStock">Low Stock</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortOption} onValueChange={setSortOption}>
            <SelectTrigger className="min-w-[160px] h-9">
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Recommended</SelectItem>
              <SelectItem value="name">Name A-Z</SelectItem>
              <SelectItem value="stockAsc">Stock ↑</SelectItem>
              <SelectItem value="stockDesc">Stock ↓</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isAdmin ? (
        <div className="rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-50/50 to-transparent p-4">
          <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Admin controls active
          </p>
          <p className="text-xs text-amber-600/70 mt-0.5">Activate/deactivate/delete actions are restricted to admin users only.</p>
        </div>
      ) : null}

      <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Selling Price / Unit</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? [...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {[...Array(6)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
              </TableRow>
            )) : productResponseInvalid ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-32 text-destructive">Unable to load products. Please refresh or check the backend.</TableCell>
              </TableRow>
            ) : filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-32 text-muted-foreground">No products match your filters.</TableCell>
              </TableRow>
            ) : filteredProducts.map(product => (
              <TableRow key={product.id}>
                <TableCell>
                  <div className="font-medium">{product.name}</div>
                  <div className="text-xs text-muted-foreground">{product.genericName}</div>
                </TableCell>
                <TableCell>{product.category || "-"}</TableCell>
                <TableCell className="text-right">
                  {(product.sellingPricePerUnit ?? 0) > 0
                    ? <span className="tabular-nums">{fmt(product.sellingPricePerUnit ?? 0)}</span>
                    : <span className="text-muted-foreground text-xs">Set via Inventory</span>
                  }
                </TableCell>
                <TableCell className="text-right">
                  <div className="font-medium">{product.totalTablets} units</div>
                  {product.totalTablets <= (product.reorderLevel ?? 50) && (
                    <div className="text-xs text-destructive flex items-center justify-end gap-1 mt-1">
                      <AlertCircle className="w-3 h-3" /> Low Stock
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={product.isActive ? "default" : "secondary"}>
                    {product.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(product)}><Edit className="w-4 h-4" /></Button>
                  {isAdmin ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleActive(product, !product.isActive)}
                        title={product.isActive ? "Deactivate" : "Activate"}
                      >
                        {product.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteId(product.id)}><Trash className="w-4 h-4" /></Button>
                    </>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Name *</Label>
                <Input value={form.name} onChange={set("name")} placeholder="e.g. Paracetamol 500mg" />
              </div>
              <div className="space-y-1">
                <Label>Generic Name</Label>
                <Input value={form.genericName} onChange={set("genericName")} placeholder="e.g. Paracetamol" />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Input value={form.category} onChange={set("category")} placeholder="e.g. Analgesic" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Reorder Level (units)</Label>
                <Input type="number" value={form.reorderLevel} onChange={set("reorderLevel")} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Unit type (tablet/syrup), pack/box sizes, and pricing are set when receiving inventory under the Inventory section.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isPending}>{isPending ? "Saving…" : editingId ? "Save Changes" : "Add Product"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the product and all its stock data.</AlertDialogDescription>
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
