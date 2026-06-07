import { useState, useRef } from "react";
import { useListSales, useGetSaleReceipt, getListSalesQueryKey, getGetSaleReceiptQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Receipt, Printer, Upload, ImageIcon } from "lucide-react";
import { format } from "date-fns";

function InlineInput({ value, onChange, placeholder, className = "" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <input
      className={`bg-transparent border-0 border-b border-dashed border-transparent hover:border-gray-300 focus:border-primary focus:outline-none w-full ${className}`}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function ReceiptModal({ saleId, onClose }: { saleId: number; onClose: () => void }) {
  const { data: receipt, isLoading } = useGetSaleReceipt(saleId, { query: { queryKey: getGetSaleReceiptQueryKey(saleId) } });
  const fileRef = useRef<HTMLInputElement>(null);

  const [edits, setEdits] = useState<{
    storeName?: string; storeAddress?: string; storePhone?: string; customerName?: string; logoSrc?: string;
  }>({});

  const set = (k: keyof typeof edits) => (v: string) => setEdits(e => ({ ...e, [k]: v }));

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setEdits(ed => ({ ...ed, logoSrc: ev.target?.result as string }));
    reader.readAsDataURL(file);
  };

  const handlePrint = () => {
    if (!receipt) return;
    const { sale, settings } = receipt;
    const storeName = edits.storeName ?? settings.storeName ?? "Medical Store";
    const storeAddress = edits.storeAddress ?? settings.storeAddress ?? "";
    const storePhone = edits.storePhone ?? settings.storePhone ?? "";
    const customerName = edits.customerName ?? sale.customerName ?? "";
    const logo = edits.logoSrc ?? "";

    const lines = sale.lines.map(l =>
      `<tr>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb">${l.productName}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${l.quantity} ${l.unitType}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right">₨${l.unitPrice.toFixed(2)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right">₨${l.total.toFixed(2)}</td>
      </tr>`
    ).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice — ${sale.saleNumber}</title>
  <style>
    @page { margin: 16mm; size: A4; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #111; background: #fff; }
    .invoice-card { padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid #1d4ed8; }
    .store-info .name { font-size: 22px; font-weight: 700; color: #1d4ed8; margin-bottom: 4px; }
    .store-info .detail { font-size: 12px; color: #6b7280; line-height: 1.6; }
    .logo { width: 80px; height: 80px; object-fit: contain; margin-bottom: 12px; }
    .logo-placeholder { width: 80px; height: 80px; background: #f3f4f6; border-radius: 8px; }
    .invoice-meta { text-align: right; }
    .invoice-meta .inv-label { font-size: 28px; font-weight: 800; color: #1d4ed8; letter-spacing: -0.5px; }
    .invoice-meta table { margin-top: 8px; margin-left: auto; }
    .invoice-meta td { padding: 2px 0 2px 16px; font-size: 12px; }
    .invoice-meta .label { color: #6b7280; text-align: right; }
    .invoice-meta .value { font-weight: 600; text-align: right; }
    .customer-section { background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 28px; }
    .customer-section .cs-label { font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .customer-section .cs-value { font-size: 14px; font-weight: 600; }
    table.items { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    table.items thead tr { background: #1d4ed8; color: #fff; }
    table.items thead th { padding: 10px 8px; text-align: left; font-size: 12px; font-weight: 600; }
    table.items thead th:not(:first-child) { text-align: right; }
    table.items tbody tr:nth-child(even) { background: #f9fafb; }
    .totals { margin-left: auto; width: 280px; }
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6; }
    .totals-grand { display: flex; justify-content: space-between; background: #1d4ed8; color: #fff; padding: 12px 16px; border-radius: 6px; margin-top: 8px; font-size: 16px; font-weight: 700; }
    .footer { text-align: center; margin-top: 40px; padding-top: 16px; border-top: 1px dashed #d1d5db; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="invoice-card">
    <div class="header">
      <div class="store-info">
        ${logo ? `<img src="${logo}" class="logo" />` : ""}
        <div class="name">${storeName}</div>
        ${storeAddress ? `<div class="detail">${storeAddress.replace(/\n/g, "<br>")}</div>` : ""}
        ${storePhone ? `<div class="detail">Tel: ${storePhone}</div>` : ""}
      </div>
      <div class="invoice-meta">
        <div class="inv-label">INVOICE</div>
        <table>
          <tr><td class="label">Invoice #</td><td class="value">${sale.saleNumber}</td></tr>
          <tr><td class="label">Date</td><td class="value">${format(new Date(sale.date), "dd MMM yyyy")}</td></tr>
        </table>
      </div>
    </div>
    ${customerName ? `
    <div class="customer-section">
      <div class="cs-label">Bill To</div>
      <div class="cs-value">${customerName}</div>
    </div>` : ""}
    <table class="items">
      <thead><tr>
        <th>Item Description</th>
        <th style="text-align:right">Qty</th>
        <th style="text-align:right">Unit Price</th>
        <th style="text-align:right">Amount</th>
      </tr></thead>
      <tbody>${lines}</tbody>
    </table>
    <div class="totals">
      <div class="totals-row"><span>Subtotal</span><span>₨${sale.subtotal.toFixed(2)}</span></div>
      ${sale.discount > 0 ? `<div class="totals-row" style="color:#16a34a"><span>Discount</span><span>-₨${sale.discount.toFixed(2)}</span></div>` : ""}
      <div class="totals-grand"><span>TOTAL</span><span>₨${sale.total.toFixed(2)}</span></div>
    </div>
    <div class="footer">${settings.footerText || "Thank you for your business!"}</div>
  </div>
  <script>window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; }</script>
</body>
</html>`;

    const w = window.open("", "_blank", "width=794,height=1123");
    if (w) { w.document.write(html); w.document.close(); }
  };

  if (isLoading) {
    return (
      <DialogContent className="max-w-2xl">
        <div className="space-y-4 py-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </DialogContent>
    );
  }

  if (!receipt) return (
    <DialogContent className="max-w-2xl">
      <p className="text-center text-muted-foreground py-8">Receipt not found.</p>
    </DialogContent>
  );

  const { sale, settings } = receipt;
  const storeName = edits.storeName ?? settings.storeName ?? "Medical Store";
  const storeAddress = edits.storeAddress ?? settings.storeAddress ?? "";
  const storePhone = edits.storePhone ?? settings.storePhone ?? "";
  const customerName = edits.customerName ?? sale.customerName ?? "";
  const logoSrc = edits.logoSrc ?? "";

  return (
    <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />

      <div className="bg-white rounded-lg shadow-inner">
        <div className="p-2 bg-muted/60 border-b flex items-center justify-between text-xs text-muted-foreground px-4">
          <span>Click any field to edit before printing</span>
          <Button size="sm" onClick={handlePrint} className="gap-2 h-8">
            <Printer className="w-3.5 h-3.5" /> Print Invoice
          </Button>
        </div>

        <div className="p-8 space-y-6">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-primary pb-6">
            <div className="space-y-3">
              {/* Logo */}
              <button
                onClick={() => fileRef.current?.click()}
                className="group relative w-20 h-20 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary flex items-center justify-center overflow-hidden transition-colors"
                title="Click to upload logo"
              >
                {logoSrc ? (
                  <img src={logoSrc} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <div className="text-center text-muted-foreground group-hover:text-primary">
                    <ImageIcon className="w-6 h-6 mx-auto mb-1" />
                    <span className="text-[10px]">Logo</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Upload className="w-4 h-4 text-white" />
                </div>
              </button>
              {/* Store Name */}
              <InlineInput
                value={storeName}
                onChange={set("storeName")}
                placeholder="Store Name"
                className="text-2xl font-bold text-primary"
              />
              <InlineInput
                value={storeAddress}
                onChange={set("storeAddress")}
                placeholder="Store Address"
                className="text-sm text-muted-foreground"
              />
              <InlineInput
                value={storePhone}
                onChange={set("storePhone")}
                placeholder="Phone Number"
                className="text-sm text-muted-foreground"
              />
            </div>

            <div className="text-right space-y-2">
              <div className="text-4xl font-black text-primary tracking-tight">INVOICE</div>
              <div className="space-y-1 text-sm">
                <div className="flex items-center justify-end gap-3">
                  <span className="text-muted-foreground">Invoice #</span>
                  <span className="font-mono font-semibold">{sale.saleNumber}</span>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">{format(new Date(sale.date), "dd MMM yyyy")}</span>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <span className="text-muted-foreground">Time</span>
                  <span className="font-medium">{format(new Date(sale.date), "h:mm a")}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bill To */}
          <div className="bg-muted/40 rounded-lg p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Bill To</p>
            <InlineInput
              value={customerName}
              onChange={set("customerName")}
              placeholder="Customer Name (click to edit)"
              className="text-base font-semibold"
            />
          </div>

          {/* Items Table */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary text-white">
                  <th className="px-4 py-3 text-left font-semibold">Item Description</th>
                  <th className="px-4 py-3 text-right font-semibold">Qty</th>
                  <th className="px-4 py-3 text-right font-semibold">Unit Price</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sale.lines.map((line, i) => (
                  <tr key={line.id} className={i % 2 === 1 ? "bg-muted/20" : ""}>
                    <td className="px-4 py-3 font-medium">{line.productName}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{line.quantity} {line.unitType}</td>
                    <td className="px-4 py-3 text-right">₨{line.unitPrice.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-semibold">₨{line.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground border-b pb-2">
                <span>Subtotal</span>
                <span>₨{sale.subtotal.toFixed(2)}</span>
              </div>
              {sale.discount > 0 && (
                <div className="flex justify-between text-sm text-green-600 border-b pb-2">
                  <span>Discount</span>
                  <span>-₨{sale.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center bg-primary text-white px-4 py-3 rounded-lg font-bold text-lg">
                <span>TOTAL</span>
                <span>₨{sale.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          {settings.footerText && (
            <p className="text-center text-xs text-muted-foreground pt-4 border-t border-dashed">
              {settings.footerText}
            </p>
          )}
        </div>
      </div>
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
          <p className="text-muted-foreground mt-1">Click any row to view and print the invoice.</p>
        </div>
      </div>

      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search invoice number or customer..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Invoice No</TableHead>
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
