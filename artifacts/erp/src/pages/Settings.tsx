import { useGetReceiptSettings, useUpdateReceiptSettings, getGetReceiptSettingsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

const CURRENCY_PRESETS = [
  { symbol: "₨", label: "₨ PKR" },
  { symbol: "$", label: "$ USD" },
  { symbol: "€", label: "€ EUR" },
  { symbol: "£", label: "£ GBP" },
  { symbol: "AED", label: "AED" },
  { symbol: "SAR", label: "SAR" },
  { symbol: "BDT৳", label: "৳ BDT" },
  { symbol: "₹", label: "₹ INR" },
];

export default function Settings() {
  const { data: settings, isLoading } = useGetReceiptSettings({ query: { queryKey: getGetReceiptSettingsQueryKey() } });
  const updateSettings = useUpdateReceiptSettings();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    storeName: "",
    storeAddress: "",
    storePhone: "",
    storeEmail: "",
    taxNumber: "",
    footerText: "",
    currency: "₨",
    showLogo: true,
    showAddress: true,
    showPhone: true,
    showEmail: true,
    showTaxInfo: true,
  });

  const [customCurrency, setCustomCurrency] = useState("");

  useEffect(() => {
    if (settings) {
      setFormData({
        storeName: settings.storeName || "",
        storeAddress: settings.storeAddress || "",
        storePhone: settings.storePhone || "",
        storeEmail: settings.storeEmail || "",
        taxNumber: settings.taxNumber || "",
        footerText: settings.footerText || "",
        currency: settings.currency ?? "₨",
        showLogo: settings.showLogo ?? true,
        showAddress: settings.showAddress ?? true,
        showPhone: settings.showPhone ?? true,
        showEmail: settings.showEmail ?? true,
        showTaxInfo: settings.showTaxInfo ?? true,
      });
    }
  }, [settings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings.mutate(
      { data: formData },
      {
        onSuccess: () => {
          toast({ title: "Settings updated successfully." });
        },
        onError: () => {
          toast({ title: "Failed to update settings.", variant: "destructive" });
        }
      }
    );
  };

  const setCurrency = (symbol: string) => {
    setFormData(f => ({ ...f, currency: symbol }));
    setCustomCurrency("");
  };

  const sampleNumber = (1234567.89).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <Skeleton className="h-[600px] w-full max-w-3xl rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure your store details and receipt appearance.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Store Location Card */}
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Store Information
              <Badge variant="secondary" className="text-xs font-normal">Required for receipts</Badge>
            </CardTitle>
            <CardDescription>
              Your store name and address appear on every receipt and invoice.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="storeName">Store Name</Label>
                <Input
                  id="storeName"
                  value={formData.storeName}
                  onChange={e => setFormData({ ...formData, storeName: e.target.value })}
                  placeholder="e.g. Al-Shifa Medical Store"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="storePhone">Phone Number</Label>
                <Input
                  id="storePhone"
                  value={formData.storePhone}
                  onChange={e => setFormData({ ...formData, storePhone: e.target.value })}
                  placeholder="+92 300 0000000"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="storeAddress" className="text-base font-semibold">Store Address</Label>
              <Textarea
                id="storeAddress"
                value={formData.storeAddress}
                onChange={e => setFormData({ ...formData, storeAddress: e.target.value })}
                className="resize-none text-base"
                rows={3}
                placeholder="Street address, City, Province, Country"
              />
              <p className="text-xs text-muted-foreground">This address will be printed on all receipts and invoices.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="storeEmail">Email Address</Label>
                <Input
                  id="storeEmail"
                  type="email"
                  value={formData.storeEmail}
                  onChange={e => setFormData({ ...formData, storeEmail: e.target.value })}
                  placeholder="store@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxNumber">Tax / NTN Number</Label>
                <Input
                  id="taxNumber"
                  value={formData.taxNumber}
                  onChange={e => setFormData({ ...formData, taxNumber: e.target.value })}
                  placeholder="e.g. 1234567-8"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Currency Card */}
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <CardTitle>Currency</CardTitle>
            <CardDescription>
              Choose the currency symbol used throughout the app — receipts, analytics, and all reports.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-3 block">Quick Select</Label>
              <div className="flex flex-wrap gap-2">
                {CURRENCY_PRESETS.map(preset => (
                  <button
                    key={preset.symbol}
                    type="button"
                    onClick={() => setCurrency(preset.symbol)}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors
                      ${formData.currency === preset.symbol
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:bg-muted"
                      }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customCurrency">Custom Symbol</Label>
              <div className="flex gap-2">
                <Input
                  id="customCurrency"
                  value={customCurrency}
                  onChange={e => setCustomCurrency(e.target.value)}
                  placeholder="e.g. ¥ or RMB"
                  className="max-w-[180px]"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { if (customCurrency.trim()) setCurrency(customCurrency.trim()); }}
                  disabled={!customCurrency.trim()}
                >
                  Use This
                </Button>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">Preview with comma formatting:</p>
              <p className="text-2xl font-bold tabular-nums">
                {formData.currency}{sampleNumber}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Numbers are formatted with commas: 1,234,567.89</p>
            </div>
          </CardContent>
        </Card>

        {/* Receipt Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle>Receipt Appearance</CardTitle>
            <CardDescription>Control what information shows on customer receipts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="footerText">Receipt Footer Message</Label>
              <Input
                id="footerText"
                value={formData.footerText}
                onChange={e => setFormData({ ...formData, footerText: e.target.value })}
                placeholder="Thank you for your business!"
              />
            </div>

            <div className="pt-4 border-t space-y-4">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Visibility</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="showAddress"
                    checked={formData.showAddress}
                    onCheckedChange={v => setFormData({ ...formData, showAddress: v })}
                  />
                  <Label htmlFor="showAddress">Show Address</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="showPhone"
                    checked={formData.showPhone}
                    onCheckedChange={v => setFormData({ ...formData, showPhone: v })}
                  />
                  <Label htmlFor="showPhone">Show Phone</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="showEmail"
                    checked={formData.showEmail}
                    onCheckedChange={v => setFormData({ ...formData, showEmail: v })}
                  />
                  <Label htmlFor="showEmail">Show Email</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="showTaxInfo"
                    checked={formData.showTaxInfo}
                    onCheckedChange={v => setFormData({ ...formData, showTaxInfo: v })}
                  />
                  <Label htmlFor="showTaxInfo">Show Tax Info</Label>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/50 px-6 py-4 border-t">
            <Button type="submit" disabled={updateSettings.isPending}>
              {updateSettings.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </CardFooter>
        </Card>

      </form>
    </div>
  );
}
