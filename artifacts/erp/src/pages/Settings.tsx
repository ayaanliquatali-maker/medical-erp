import { useGetReceiptSettings, useUpdateReceiptSettings, getGetReceiptSettingsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

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
    showLogo: true,
    showAddress: true,
    showPhone: true,
    showEmail: true,
    showTaxInfo: true,
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        storeName: settings.storeName || "",
        storeAddress: settings.storeAddress || "",
        storePhone: settings.storePhone || "",
        storeEmail: settings.storeEmail || "",
        taxNumber: settings.taxNumber || "",
        footerText: settings.footerText || "",
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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <Skeleton className="h-[600px] w-full max-w-3xl rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure your store details and receipt appearance.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Receipt Settings</CardTitle>
            <CardDescription>
              These details will be printed on customer receipts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="storeName">Store Name</Label>
                  <Input 
                    id="storeName" 
                    value={formData.storeName} 
                    onChange={e => setFormData({...formData, storeName: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxNumber">Tax/Registration Number</Label>
                  <Input 
                    id="taxNumber" 
                    value={formData.taxNumber} 
                    onChange={e => setFormData({...formData, taxNumber: e.target.value})} 
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="storeAddress">Store Address</Label>
                <Textarea 
                  id="storeAddress" 
                  value={formData.storeAddress} 
                  onChange={e => setFormData({...formData, storeAddress: e.target.value})} 
                  className="resize-none" 
                  rows={3} 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="storePhone">Phone Number</Label>
                  <Input 
                    id="storePhone" 
                    value={formData.storePhone} 
                    onChange={e => setFormData({...formData, storePhone: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="storeEmail">Email Address</Label>
                  <Input 
                    id="storeEmail" 
                    type="email" 
                    value={formData.storeEmail} 
                    onChange={e => setFormData({...formData, storeEmail: e.target.value})} 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="footerText">Receipt Footer Message</Label>
                <Input 
                  id="footerText" 
                  value={formData.footerText} 
                  onChange={e => setFormData({...formData, footerText: e.target.value})} 
                  placeholder="Thank you for your business!" 
                />
              </div>
            </div>

            <div className="pt-4 border-t space-y-4">
              <h3 className="font-medium">Visibility Toggles</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <Switch 
                    id="showAddress" 
                    checked={formData.showAddress} 
                    onCheckedChange={v => setFormData({...formData, showAddress: v})} 
                  />
                  <Label htmlFor="showAddress">Show Address</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch 
                    id="showPhone" 
                    checked={formData.showPhone} 
                    onCheckedChange={v => setFormData({...formData, showPhone: v})} 
                  />
                  <Label htmlFor="showPhone">Show Phone</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch 
                    id="showEmail" 
                    checked={formData.showEmail} 
                    onCheckedChange={v => setFormData({...formData, showEmail: v})} 
                  />
                  <Label htmlFor="showEmail">Show Email</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch 
                    id="showTaxInfo" 
                    checked={formData.showTaxInfo} 
                    onCheckedChange={v => setFormData({...formData, showTaxInfo: v})} 
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
