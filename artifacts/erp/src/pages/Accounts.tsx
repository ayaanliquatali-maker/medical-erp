import { useState } from "react";
import {
  useListAccounts, useCreateAccount,
  getListAccountsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Landmark } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import { useToast } from "@/hooks/use-toast";

const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;

export default function Accounts() {
  const { fmt } = useCurrency();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "" as typeof ACCOUNT_TYPES[number] | "", code: "", parentId: "", description: "" });

  const { data: accounts, isLoading } = useListAccounts({}, { query: { queryKey: getListAccountsQueryKey({}) } });
  const createAccount = useCreateAccount();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = () => {
    if (!form.name || !form.type || !form.code) {
      toast({ title: "Name, type and code are required", variant: "destructive" }); return;
    }
    createAccount.mutate({
      data: {
        name: form.name,
        type: form.type as typeof ACCOUNT_TYPES[number],
        code: form.code,
        parentId: form.parentId ? Number(form.parentId) : undefined,
        description: form.description || undefined,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey({}) });
        setDialogOpen(false);
        setForm({ name: "", type: "", code: "", parentId: "", description: "" });
        toast({ title: "Account created" });
      },
      onError: () => toast({ title: "Failed to create account", variant: "destructive" }),
    });
  };

  const typeColor: Record<string, string> = {
    asset: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    liability: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    equity: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    revenue: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    expense: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage financial accounts and view balances.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" />New Account</Button>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Account Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? [...Array(8)].map((_, i) => (
              <TableRow key={i}>{[...Array(5)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : (Array.isArray(accounts) ? accounts : []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-32 text-muted-foreground">No accounts found.</TableCell>
              </TableRow>
            ) : (Array.isArray(accounts) ? accounts : []).map(acc => (
              <TableRow key={acc.id} className="hover:bg-muted/50 transition-colors">
                <TableCell className="font-mono text-muted-foreground">{acc.code}</TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-muted-foreground" />
                    {acc.name}
                    {acc.isSystem && <Badge variant="outline" className="text-[10px] ml-1">System</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${typeColor[acc.type] ?? ""}`}>
                    {acc.type}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={acc.isActive ? "secondary" : "outline"}>{acc.isActive ? "Active" : "Inactive"}</Badge>
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{fmt(acc.balance || 0)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Account</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1">
              <Label>Account Name *</Label>
              <Input value={form.name} onChange={set("name")} placeholder="e.g. Petty Cash" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Type *</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any }))}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Code *</Label>
                <Input value={form.code} onChange={set("code")} placeholder="e.g. 1050" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Parent Account</Label>
              <Select value={form.parentId} onValueChange={v => setForm(f => ({ ...f, parentId: v }))}>
                <SelectTrigger><SelectValue placeholder="None (top-level)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(Array.isArray(accounts) ? accounts : []).map(a => <SelectItem key={a.id} value={String(a.id)}>{a.code} — {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input value={form.description} onChange={set("description")} placeholder="Optional description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createAccount.isPending}>{createAccount.isPending ? "Creating…" : "Create Account"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
