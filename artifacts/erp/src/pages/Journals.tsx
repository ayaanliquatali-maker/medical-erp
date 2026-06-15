import { useState, useMemo } from "react";
import {
  useListJournals, useCreateJournal, useDeleteJournal, useListAccounts,
  getListJournalsQueryKey, getListAccountsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAdmin } from "@/context/admin";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, BookOpen, Trash2, PlusCircle, ChevronDown, ChevronRight, ArrowRight, Check } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { parseDate } from "@/lib/utils";

type JournalLine = { accountId: string; debit: string; credit: string; description: string };
const emptyLine = (): JournalLine => ({ accountId: "", debit: "", credit: "", description: "" });
const today = () => new Date().toISOString().slice(0, 10);

const getTypeColor = (type: string) => {
  switch (type) {
    case 'sale': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200';
    case 'purchase': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200';
    case 'expense': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200';
  }
};

export default function Journals() {
  const { fmt, symbol } = useCurrency();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [form, setForm] = useState({ date: today(), description: "", reference: "" });
  const [lines, setLines] = useState<JournalLine[]>([emptyLine(), emptyLine()]);

  const { data: journals, isLoading } = useListJournals({}, { query: { queryKey: getListJournalsQueryKey({}) } });
  const { data: accounts } = useListAccounts({}, { query: { queryKey: getListAccountsQueryKey({}) } });
  const createJournal = useCreateJournal();
  const deleteJournal = useDeleteJournal();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAdmin();

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const setLine = (i: number, k: keyof JournalLine) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setLines(ls => ls.map((l, j) => j === i ? { ...l, [k]: e.target.value } : l));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListJournalsQueryKey({}) });

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    if (!form.description) { toast({ title: "Description is required", variant: "destructive" }); return; }
    if (!balanced) { toast({ title: "Debits must equal credits", variant: "destructive" }); return; }
    const validLines = lines.filter(l => l.accountId && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (validLines.length < 2) { toast({ title: "At least 2 lines needed", variant: "destructive" }); return; }

    createJournal.mutate({
      data: {
        date: new Date(form.date) as any,
        description: form.description,
        reference: form.reference || undefined,
        lines: validLines.map(l => ({
          accountId: Number(l.accountId),
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.description || undefined,
        })),
      }
    }, {
      onSuccess: () => {
        invalidate();
        setDialogOpen(false);
        setForm({ date: today(), description: "", reference: "" });
        setLines([emptyLine(), emptyLine()]);
        toast({ title: "Journal entry created" });
      },
      onError: () => toast({ title: "Failed to create journal entry", variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteJournal.mutate({ id: deleteId }, {
      onSuccess: () => { invalidate(); setDeleteId(null); toast({ title: "Journal entry deleted" }); },
      onError: () => toast({ title: "Failed to delete entry", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Journal Entries</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Click any entry to expand and see debit/credit accounts.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" />Manual Entry</Button>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-6"></TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Total Debit</TableHead>
              <TableHead className="text-right">Total Credit</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? [...Array(6)].map((_, i) => (
              <TableRow key={i}>{[...Array(8)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : (journals ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center h-32 text-muted-foreground">No journal entries yet. Entries are auto-created with sales, purchases, and expenses.</TableCell>
              </TableRow>
            ) : (journals ?? []).map(journal => {
              const expanded = expandedIds.has(journal.id);
              const debitLines = (journal as any).lines?.filter((l: any) => l.debit > 0) ?? [];
              const creditLines = (journal as any).lines?.filter((l: any) => l.credit > 0) ?? [];
              return (
                <> <TableRow
                    key={journal.id}
                    className="hover:bg-muted/50 cursor-pointer"
                    onClick={() => toggleExpand(journal.id)}
                  >
                    <TableCell className="p-2">
                      {expanded
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{format(parseDate(journal.date), "MMM d, yyyy")}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${getTypeColor(journal.type)}`}>{journal.type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground text-sm">{journal.reference || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-48">{journal.description}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium text-blue-600 tabular-nums">{fmt(journal.totalDebit || 0)}</TableCell>
                    <TableCell className="text-right font-medium text-green-600 tabular-nums">{fmt(journal.totalCredit || 0)}</TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      {isAdmin ? (
                        <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => setDeleteId(journal.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow key={`${journal.id}-lines`} className="bg-muted/20">
                      <TableCell colSpan={8} className="px-8 py-3">
                        <div className="flex flex-wrap gap-6 text-sm">
                          <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-2">Debited Accounts</p>
                            {debitLines.length === 0
                              ? <p className="text-muted-foreground text-xs">None</p>
                              : debitLines.map((l: any) => (
                                <div key={l.id} className="flex items-center gap-2">
                                  <span className="font-medium">{l.accountName}</span>
                                  <span className="text-muted-foreground">DR</span>
                                  <span className="font-bold text-blue-700 tabular-nums">{fmt(l.debit)}</span>
                                </div>
                              ))}
                          </div>
                          <div className="flex items-center self-center">
                            <ArrowRight className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-wider text-green-600 mb-2">Credited Accounts</p>
                            {creditLines.length === 0
                              ? <p className="text-muted-foreground text-xs">None</p>
                              : creditLines.map((l: any) => (
                                <div key={l.id} className="flex items-center gap-2">
                                  <span className="font-medium">{l.accountName}</span>
                                  <span className="text-muted-foreground">CR</span>
                                  <span className="font-bold text-green-700 tabular-nums">{fmt(l.credit)}</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Manual Entry Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Manual Journal Entry</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Description *</Label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Opening balance adjustment" />
              </div>
              <div className="space-y-1">
                <Label>Reference</Label>
                <Input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="e.g. JE-001" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Journal Lines</Label>
                <Button variant="outline" size="sm" onClick={() => setLines(ls => [...ls, emptyLine()])}>
                  <PlusCircle className="w-4 h-4 mr-1" /> Add Line
                </Button>
              </div>
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead className="w-28">Debit ({symbol})</TableHead>
                      <TableHead className="w-28">Credit ({symbol})</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, i) => (
                      <TableRow key={i}>
                        <TableCell className="p-2">
                          <AccountSelect
                            value={line.accountId}
                            accounts={accounts ?? []}
                            onChange={v => setLines(ls => ls.map((l, j) => j === i ? { ...l, accountId: v } : l))}
                          />
                        </TableCell>
                        <TableCell className="p-2">
                          <Input className="h-8" type="number" step="0.01" value={line.debit} onChange={setLine(i, "debit")} placeholder="0.00" />
                        </TableCell>
                        <TableCell className="p-2">
                          <Input className="h-8" type="number" step="0.01" value={line.credit} onChange={setLine(i, "credit")} placeholder="0.00" />
                        </TableCell>
                        <TableCell className="p-2">
                          {lines.length > 2 && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-medium">
                      <TableCell className="p-2 text-sm">Totals</TableCell>
                      <TableCell className="p-2 text-sm text-blue-600 tabular-nums">{fmt(totalDebit)}</TableCell>
                      <TableCell className="p-2 text-sm text-green-600 tabular-nums">{fmt(totalCredit)}</TableCell>
                      <TableCell className="p-2">
                        {totalDebit > 0 && (
                          <span className={`text-xs font-medium ${balanced ? "text-green-600" : "text-destructive"}`}>
                            {balanced ? "✓ Balanced" : "Unbalanced"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createJournal.isPending || !balanced}>
              {createJournal.isPending ? "Saving…" : "Create Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Journal Entry?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this journal entry and all its lines. This cannot be undone.</AlertDialogDescription>
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

function flattenAccounts(accounts: any[]): any[] {
  const result: any[] = [];
  for (const a of accounts) {
    result.push(a);
    if (a.children?.length) result.push(...flattenAccounts(a.children));
  }
  return result;
}

function AccountSelect({ value, accounts, onChange }: { value: string; accounts: any[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const flatAccounts = useMemo(() => flattenAccounts(accounts), [accounts]);
  const selected = flatAccounts.find(a => String(a.id) === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 w-full justify-start text-xs font-normal px-2">
          {selected ? `${selected.code} — ${selected.name}` : <span className="text-muted-foreground">Select account</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search accounts..." className="h-9" />
          <CommandList>
            <CommandEmpty>No account found.</CommandEmpty>
            <CommandGroup>
              {flatAccounts.map(a => (
                <CommandItem
                  key={a.id}
                  value={`${a.code} ${a.name} ${a.type}`}
                  onSelect={() => { onChange(String(a.id)); setOpen(false); }}
                >
                  <Check className={`w-4 h-4 mr-2 ${String(a.id) === value ? "opacity-100" : "opacity-0"}`} />
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs text-muted-foreground shrink-0">{a.code}</span>
                    <span className="truncate">{a.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">({a.type})</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
