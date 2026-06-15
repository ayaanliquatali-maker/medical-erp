import { useState } from "react";
import {
  useListExpenses, useCreateExpense, useDeleteExpense,
  useListAccounts, useListVendors,
  getListExpensesQueryKey, getListAccountsQueryKey, getListVendorsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAdmin } from "@/context/admin";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useCurrency } from "@/hooks/use-currency";
import { parseDate } from "@/lib/utils";

const today = () => new Date().toISOString().slice(0, 10);

export default function Expenses() {
  const { fmt } = useCurrency();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ date: today(), amount: "", description: "", expenseAccountId: "", paymentAccountId: "", vendorId: "", reference: "" });

  const { data: expenses, isLoading } = useListExpenses({}, { query: { queryKey: getListExpensesQueryKey({}) } });
  const { data: accounts } = useListAccounts({}, { query: { queryKey: getListAccountsQueryKey({}) } });
  const { data: vendors } = useListVendors({}, { query: { queryKey: getListVendorsQueryKey({}) } });
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAdmin();

  const expenseAccounts = (Array.isArray(accounts) ? accounts : []).filter(a => a.type === "expense");
  const paymentAccounts = (Array.isArray(accounts) ? accounts : []).filter(a => a.type === "asset" && (a.code === "1000" || a.code === "1100"));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListExpensesQueryKey({}) });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = () => {
    if (!form.amount || !form.description || !form.expenseAccountId || !form.paymentAccountId) {
      toast({ title: "Please fill all required fields", variant: "destructive" }); return;
    }
    createExpense.mutate({
      data: {
        date: new Date(form.date) as any,
        amount: Number(form.amount),
        description: form.description,
        expenseAccountId: Number(form.expenseAccountId),
        paymentAccountId: Number(form.paymentAccountId),
        vendorId: form.vendorId ? Number(form.vendorId) : undefined,
        reference: form.reference || undefined,
      }
    }, {
      onSuccess: () => {
        invalidate();
        setDialogOpen(false);
        setForm({ date: today(), amount: "", description: "", expenseAccountId: "", paymentAccountId: "", vendorId: "", reference: "" });
        toast({ title: "Expense recorded" });
      },
      onError: () => toast({ title: "Failed to record expense", variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteExpense.mutate({ id: deleteId }, {
      onSuccess: () => { invalidate(); setDeleteId(null); toast({ title: "Expense deleted" }); },
      onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Record and track operational expenses.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" />Record Expense</Button>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Payment Account</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? [...Array(5)].map((_, i) => (
              <TableRow key={i}>{[...Array(7)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : (Array.isArray(expenses) ? expenses : []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-32 text-muted-foreground">No expenses recorded yet.</TableCell>
              </TableRow>
            ) : (Array.isArray(expenses) ? expenses : []).map(expense => (
              <TableRow key={expense.id}> 
                <TableCell className="font-medium">{format(parseDate(expense.date), "MMM d, yyyy")}</TableCell>
                <TableCell>{expense.description}</TableCell>
                <TableCell>{expense.expenseAccountName}</TableCell>
                <TableCell>{expense.paymentAccountName}</TableCell>
                <TableCell>{expense.vendorName || "-"}</TableCell>
                <TableCell className="text-right font-medium text-destructive tabular-nums">{fmt(expense.amount)}</TableCell>
                <TableCell className="text-right">
                  {isAdmin ? (
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteId(expense.id)}><Trash className="w-4 h-4" /></Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Expense</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={set("date")} />
              </div>
              <div className="space-y-1">
                <Label>Amount *</Label>
                <Input type="number" step="0.01" value={form.amount} onChange={set("amount")} placeholder="0.00" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Description *</Label>
              <Input value={form.description} onChange={set("description")} placeholder="e.g. Shop rent for June" />
            </div>
            <div className="space-y-1">
              <Label>Expense Category *</Label>
              <Select value={form.expenseAccountId} onValueChange={v => setForm(f => ({ ...f, expenseAccountId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select expense category" /></SelectTrigger>
                <SelectContent>
                  {expenseAccounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Pay From *</Label>
              <Select value={form.paymentAccountId} onValueChange={v => setForm(f => ({ ...f, paymentAccountId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select payment account" /></SelectTrigger>
                <SelectContent>
                  {paymentAccounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
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
              <Label>Reference</Label>
              <Input value={form.reference} onChange={set("reference")} placeholder="Invoice # or reference" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createExpense.isPending}>{createExpense.isPending ? "Saving…" : "Record Expense"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this expense and its journal entry.</AlertDialogDescription>
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
