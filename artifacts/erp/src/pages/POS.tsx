import { useState } from "react";
import {
  useListProducts, useCreateSale, useListAccounts,
  getListProductsQueryKey, getListAccountsQueryKey, getListSalesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, ShoppingCart, X, ChevronRight, CheckCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type CartItem = { productId: number; productName: string; unitType: "tablet" | "pack" | "box"; quantity: number; unitPrice: number; discount: number };

export default function POS() {
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({ customerName: "", paymentAccountId: "", discount: "0" });
  const [success, setSuccess] = useState<number | null>(null);

  const { data: products, isLoading } = useListProducts({ search }, { query: { queryKey: getListProductsQueryKey({ search }) } });
  const { data: accounts } = useListAccounts({}, { query: { queryKey: getListAccountsQueryKey({}) } });
  const createSale = useCreateSale();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const cashAccounts = accounts?.filter(a => a.type === "asset" && (a.code === "1000" || a.code === "1100")) ?? [];

  const addToCart = (product: any) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id && item.unitType === "tablet");
      if (existing) return prev.map(item => item.productId === product.id && item.unitType === "tablet" ? { ...item, quantity: item.quantity + 1 } : item);
      return [...prev, { productId: product.id, productName: product.name, unitType: "tablet", quantity: 1, unitPrice: product.sellingPricePerUnit, discount: 0 }];
    });
  };

  const removeFromCart = (index: number) => setCart(prev => prev.filter((_, i) => i !== index));

  const updateQty = (index: number, qty: number) =>
    setCart(prev => prev.map((c, i) => i === index ? { ...c, quantity: Math.max(1, qty) } : c));

  const updateUnitType = (index: number, unitType: "tablet" | "pack" | "box") => {
    const product = products?.find(p => p.id === cart[index].productId);
    if (!product) return;
    const price = unitType === "tablet" ? product.sellingPricePerUnit
      : unitType === "pack" ? (product.sellingPricePerPack ?? product.sellingPricePerUnit * (product.tabsPerPack ?? 1))
      : (product.sellingPricePerBox ?? product.sellingPricePerUnit * (product.tabsPerPack ?? 1) * (product.packsPerBox ?? 1));
    setCart(prev => prev.map((c, i) => i === index ? { ...c, unitType, unitPrice: price } : c));
  };

  const subtotal = cart.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  const globalDiscount = Number(checkoutForm.discount) || 0;
  const total = Math.max(0, subtotal - globalDiscount);

  const handleCheckout = () => {
    if (!checkoutForm.paymentAccountId) { toast({ title: "Select a payment account", variant: "destructive" }); return; }
    if (cart.length === 0) { toast({ title: "Cart is empty", variant: "destructive" }); return; }

    createSale.mutate({
      data: {
        date: new Date() as any,
        customerName: checkoutForm.customerName || undefined,
        discount: globalDiscount || undefined,
        paymentAccountId: Number(checkoutForm.paymentAccountId),
        lines: cart.map(item => ({
          productId: item.productId,
          unitType: item.unitType,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount || undefined,
        })),
      }
    }, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey({}) });
        queryClient.invalidateQueries({ queryKey: getListSalesQueryKey({}) });
        setSuccess(data.id);
        setCart([]);
        setCheckoutForm({ customerName: "", paymentAccountId: "", discount: "0" });
      },
      onError: () => toast({ title: "Failed to process sale", variant: "destructive" }),
    });
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-12 text-lg rounded-xl shadow-sm" />
        </div>
        <ScrollArea className="flex-1 border rounded-xl bg-muted/20 p-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {isLoading ? [...Array(8)].map((_, i) => (
              <Card key={i} className="animate-pulse"><CardContent className="h-32 p-4"><div className="h-4 bg-muted rounded w-2/3 mb-2" /><div className="h-8 bg-muted rounded w-1/3" /></CardContent></Card>
            )) : products?.length === 0 ? (
              <div className="col-span-full text-center text-muted-foreground py-12">No products found. Add products first.</div>
            ) : products?.map(product => (
              <Card key={product.id} className="cursor-pointer hover:border-primary transition-all hover:shadow-md active:scale-[0.98] select-none" onClick={() => addToCart(product)}>
                <CardContent className="p-4 flex flex-col h-full justify-between min-h-[120px]">
                  <div>
                    <h3 className="font-semibold line-clamp-2 leading-tight">{product.name}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{product.genericName}</p>
                  </div>
                  <div className="flex items-end justify-between mt-4">
                    <div className="text-lg font-bold text-primary">₨{product.sellingPricePerUnit.toFixed(2)}</div>
                    <Badge variant={product.totalTablets > 0 ? "secondary" : "destructive"}>{product.totalTablets} units</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      <Card className="w-96 flex flex-col shadow-lg border-primary/10">
        <CardHeader className="bg-primary/5 pb-4 border-b">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-primary" />Current Sale</div>
            {cart.length > 0 && <Badge variant="secondary" className="font-mono">{cart.length} items</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
              <ShoppingCart className="w-12 h-12 mb-4 opacity-20" />
              <p>Cart is empty</p>
              <p className="text-sm mt-1 opacity-70">Click products to add them.</p>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="divide-y">
                {cart.map((item, index) => (
                  <div key={index} className="p-3 flex gap-2 hover:bg-muted/30 transition-colors">
                    <div className="flex-1 space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="font-medium text-sm leading-tight">{item.productName}</span>
                        <span className="font-bold text-sm ml-2">₨{(item.quantity * item.unitPrice).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select value={item.unitType} onValueChange={v => updateUnitType(index, v as any)}>
                          <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tablet">Tablet</SelectItem>
                            <SelectItem value="pack">Pack</SelectItem>
                            <SelectItem value="box">Box</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input type="number" className="h-7 w-16 px-2 text-sm" value={item.quantity} min={1}
                          onChange={e => updateQty(index, parseInt(e.target.value) || 1)} />
                        <span className="text-xs text-muted-foreground">× ₨{item.unitPrice.toFixed(2)}</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive self-start shrink-0" onClick={() => removeFromCart(index)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
        <CardFooter className="flex flex-col border-t bg-muted/10 p-4 gap-4">
          <div className="w-full space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>₨{subtotal.toFixed(2)}</span></div>
            <Separator />
            <div className="flex justify-between text-xl font-bold"><span>Total</span><span className="text-primary">₨{subtotal.toFixed(2)}</span></div>
          </div>
          <Button size="lg" className="w-full h-12 text-base" disabled={cart.length === 0} onClick={() => setCheckoutOpen(true)}>
            Checkout <ChevronRight className="w-5 h-5 ml-1" />
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Complete Sale</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Items</span><span>{cart.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>₨{subtotal.toFixed(2)}</span></div>
              {globalDiscount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>-₨{globalDiscount.toFixed(2)}</span></div>}
              <Separator />
              <div className="flex justify-between font-bold text-base"><span>Total</span><span>₨{total.toFixed(2)}</span></div>
            </div>
            <div className="space-y-1">
              <Label>Customer Name</Label>
              <Input value={checkoutForm.customerName} onChange={e => setCheckoutForm(f => ({ ...f, customerName: e.target.value }))} placeholder="Walk-in customer" />
            </div>
            <div className="space-y-1">
              <Label>Discount (₨)</Label>
              <Input type="number" step="0.01" value={checkoutForm.discount} onChange={e => setCheckoutForm(f => ({ ...f, discount: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label>Payment Account *</Label>
              <Select value={checkoutForm.paymentAccountId} onValueChange={v => setCheckoutForm(f => ({ ...f, paymentAccountId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {cashAccounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>Cancel</Button>
            <Button onClick={handleCheckout} disabled={createSale.isPending || !checkoutForm.paymentAccountId}>
              {createSale.isPending ? "Processing…" : "Confirm Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!success} onOpenChange={() => setSuccess(null)}>
        <DialogContent className="max-w-sm text-center">
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle className="w-16 h-16 text-green-500" />
            <div>
              <h2 className="text-xl font-bold">Sale Complete!</h2>
              <p className="text-muted-foreground mt-1">Sale #{success} has been recorded.</p>
            </div>
            <Button className="w-full" onClick={() => setSuccess(null)}>New Sale</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
