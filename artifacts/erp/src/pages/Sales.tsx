import { useState } from "react";
import { useListSales, useGetSaleReceipt, getListSalesQueryKey, getGetSaleReceiptQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Search, Receipt, Printer } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

function ReceiptModal({ saleId, onClose }: { saleId: number; onClose: () => void }) {
  const { data: receipt, isLoading } = useGetSaleReceipt(saleId, { query: { queryKey: getGetSaleReceiptQueryKey(saleId) } });

  const handlePrint = () => {
    if (!receipt) return;
    const { sale, settings } = receipt;

    const lines = sale.lines.map(l =>
      `<tr>
        <td style="padding:4px 0;border-bottom:1px solid #eee">${l.productName}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center">${l.quantity} ${l.unitType}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">₨${l.unitPrice.toFixed(2)}</td>
        <td style="padding:4px 0;border-bottom:1px solid #eee;text-align:right">₨${l.total.toFixed(2)}</td>
      </tr>`
    ).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt — ${sale.saleNumber}</title>
  <style>
    @page { margin: 10mm; size: 80mm auto; }
    body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 0; color: #111; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .sep { border-top: 1px dashed #999; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 11px; color: #555; padding-bottom: 4px; border-bottom: 1px solid #999; }
    .totals td { padding: 2px 0; }
    .grand-total td { font-weight: bold; font-size: 14px; padding-top: 4px; }
  </style>
</head>
<body>
  <div class="center bold" style="font-size:16px;margin-bottom:4px">${settings.storeName || "Medical Store"}</div>
  ${settings.showAddress && settings.storeAddress ? `<div class="center" style="font-size:11px">${settings.storeAddress}</div>` : ""}
  ${settings.showPhone && settings.storePhone ? `<div class="center" style="font-size:11px">Tel: ${settings.storePhone}</div>` : ""}
  ${settings.showEmail && settings.storeEmail ? `<div class="center" style="font-size:11px">${settings.storeEmail}</div>` : ""}
  <div class="sep"></div>
  <div style="display:flex;justify-content:space-between;font-size:11px">
    <span><b>Receipt:</b> ${sale.saleNumber}</span>
    <span>${format(new Date(sale.date), "dd/MM/yyyy HH:mm")}</span>
  </div>
  ${sale.customerName ? `<div style="font-size:11px"><b>Customer:</b> ${sale.customerName}</div>` : ""}
  <div class="sep"></div>
  <table>
    <thead><tr>
      <th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th>
    </tr></thead>
    <tbody>${lines}</tbody>
  </table>
  <div class="sep"></div>
  <table class="totals">
    <tr><td>Subtotal</td><td style="text-align:right">₨${sale.subtotal.toFixed(2)}</td></tr>
    ${sale.discount > 0 ? `<tr><td>Discount</td><td style="text-align:right">-₨${sale.discount.toFixed(2)}</td></tr>` : ""}
  </table>
  <div style="border-top:2px solid #111;margin:4px 0"></div>
  <table class="totals grand-total">
    <tr><td>TOTAL</td><td style="text-align:right">₨${sale.total.toFixed(2)}</td></tr>
  </table>
  <div class="sep"></div>
  ${settings.footerText ? `<div class="center" style="font-size:11px;margin-top:8px">${settings.footerText}</div>` : '<div class="center" style="font-size:11px;margin-top:8px">Thank you for your purchase!</div>'}
  <script>window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; }</script>
</body>
</html>`;

    const w = window.open("", "_blank", "width=400,height=600");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <DialogContent className="max-w-md">
      {isLoading ? (
        <div className="space-y-3 py-4">
          <Skeleton className="h-6 w-48 mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : receipt ? (
        <div className="space-y-4">
          {/* Header */}
          <div className="text-center space-y-0.5 pb-2 border-b">
            <h2 className="text-lg font-bold">{receipt.settings.storeName || "Medical Store"}</h2>
            {receipt.settings.showAddress && receipt.settings.storeAddress && (
              <p className="text-xs text-muted-foreground">{receipt.settings.storeAddress}</p>
            )}
            {receipt.settings.showPhone && receipt.settings.storePhone && (
              <p className="text-xs text-muted-foreground">Tel: {receipt.settings.storePhone}</p>
            )}
          </div>

          {/* Meta */}
          <div className="flex justify-between text-sm">
            <div>
              <p className="font-mono font-medium flex items-center gap-1"><Receipt className="w-3.5 h-3.5" /> {receipt.sale.saleNumber}</p>
              {receipt.sale.customerName && <p className="text-muted-foreground text-xs">Customer: {receipt.sale.customerName}</p>}
            </div>
            <p className="text-muted-foreground text-xs">{format(new Date(receipt.sale.date), "dd MMM yyyy, h:mm a")}</p>
          </div>

          <Separator />

          {/* Lines */}
          <div className="space-y-2">
            {receipt.sale.lines.map(line => (
              <div key={line.id} className="flex justify-between text-sm">
                <div>
                  <p className="font-medium">{line.productName}</p>
                  <p className="text-xs text-muted-foreground">{line.quantity} {line.unitType} × ₨{line.unitPrice.toFixed(2)}</p>
                </div>
                <p className="font-medium">₨{line.total.toFixed(2)}</p>
              </div>
            ))}
          </div>

          <Separator />

          {/* Totals */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span>₨{receipt.sale.subtotal.toFixed(2)}</span>
            </div>
            {receipt.sale.discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span><span>-₨{receipt.sale.discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-1 border-t">
              <span>TOTAL</span><span className="text-primary">₨{receipt.sale.total.toFixed(2)}</span>
            </div>
          </div>

          {receipt.settings.footerText && (
            <p className="text-center text-xs text-muted-foreground pt-2 border-t">{receipt.settings.footerText}</p>
          )}

          <Button className="w-full" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" /> Print Receipt
          </Button>
        </div>
      ) : (
        <p className="text-center text-muted-foreground py-8">Receipt not found.</p>
      )}
    </DialogContent>
  );
}

export default function Sales() {
  const [search, setSearch] = useState("");
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
  const { data: sales, isLoading } = useListSales({ search }, { query: { queryKey: getListSalesQueryKey({ search }) } });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sales History</h1>
          <p className="text-muted-foreground mt-1">Click any row to view and print the receipt.</p>
        </div>
      </div>

      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search receipt number or customer..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Receipt No</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Payment Account</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">Discount</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? [...Array(5)].map((_, i) => (
              <TableRow key={i}>{[...Array(7)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : sales?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-32 text-muted-foreground">No sales yet. Make a sale from Point of Sale.</TableCell>
              </TableRow>
            ) : sales?.map(sale => (
              <TableRow
                key={sale.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setSelectedSaleId(sale.id)}
              >
                <TableCell>{format(new Date(sale.date), "MMM d, yyyy h:mm a")}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 font-mono text-sm">
                    <Receipt className="w-4 h-4 text-muted-foreground" />
                    {sale.saleNumber}
                  </div>
                </TableCell>
                <TableCell>{sale.customerName || "Walk-in"}</TableCell>
                <TableCell>{sale.paymentAccountName}</TableCell>
                <TableCell className="text-right">₨{sale.subtotal.toFixed(2)}</TableCell>
                <TableCell className="text-right">₨{sale.discount.toFixed(2)}</TableCell>
                <TableCell className="text-right font-bold text-primary">₨{sale.total.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selectedSaleId} onOpenChange={o => !o && setSelectedSaleId(null)}>
        {selectedSaleId && <ReceiptModal saleId={selectedSaleId} onClose={() => setSelectedSaleId(null)} />}
      </Dialog>
    </div>
  );
}
