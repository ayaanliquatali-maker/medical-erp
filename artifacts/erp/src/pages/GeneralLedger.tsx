import { useState } from "react";
import {
  useListAccounts, useGetAccountBalance,
  getListAccountsQueryKey, getGetAccountBalanceQueryKey,
} from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format } from "date-fns";

const typeColor: Record<string, string> = {
  asset: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  liability: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  equity: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  revenue: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  expense: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

function AccountLedger({ accountId, onBack }: { accountId: number; onBack: () => void }) {
  const { data, isLoading } = useGetAccountBalance(accountId, {
    query: { queryKey: getGetAccountBalanceQueryKey(accountId) },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data) return <p className="text-muted-foreground">Account not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Accounts
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{data.accountName}</h2>
          <p className="text-muted-foreground text-sm">Account Ledger — All Transactions</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-100 dark:border-blue-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">Total Debits</p>
          <p className="text-2xl font-bold text-blue-700">₨{(data.debits || 0).toFixed(2)}</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-100 dark:border-green-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-green-600 mb-1">Total Credits</p>
          <p className="text-2xl font-bold text-green-700">₨{(data.credits || 0).toFixed(2)}</p>
        </div>
        <div className="bg-card rounded-lg p-4 border">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Net Balance</p>
          <p className={`text-2xl font-bold ${data.balance > 0 ? "text-primary" : data.balance < 0 ? "text-destructive" : "text-muted-foreground"}`}>
            ₨{(data.balance || 0).toFixed(2)}
          </p>
        </div>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Running Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data.transactions || data.transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-32 text-muted-foreground">
                  No transactions in this account yet.
                </TableCell>
              </TableRow>
            ) : data.transactions.map((tx: any) => (
              <TableRow key={tx.id} className="hover:bg-muted/50">
                <TableCell className="whitespace-nowrap text-sm">
                  {format(new Date(tx.date), "MMM d, yyyy")}
                </TableCell>
                <TableCell className="text-sm max-w-xs truncate">{tx.description}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{tx.reference || "-"}</TableCell>
                <TableCell className="text-right">
                  {tx.debit > 0 ? (
                    <span className="font-medium text-blue-600">₨{tx.debit.toFixed(2)}</span>
                  ) : <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell className="text-right">
                  {tx.credit > 0 ? (
                    <span className="font-medium text-green-600">₨{tx.credit.toFixed(2)}</span>
                  ) : <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  <span className={tx.balance > 0 ? "text-primary" : tx.balance < 0 ? "text-destructive" : ""}>
                    ₨{tx.balance.toFixed(2)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function GeneralLedger() {
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const { data: accounts, isLoading } = useListAccounts({}, { query: { queryKey: getListAccountsQueryKey({}) } });

  if (selectedAccountId !== null) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
        <AccountLedger accountId={selectedAccountId} onBack={() => setSelectedAccountId(null)} />
      </div>
    );
  }

  const grouped: Record<string, typeof accounts> = {};
  for (const acc of accounts ?? []) {
    if (!grouped[acc.type]) grouped[acc.type] = [];
    grouped[acc.type]!.push(acc);
  }

  const typeOrder = ["asset", "liability", "equity", "revenue", "expense"];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">General Ledger</h1>
        <p className="text-muted-foreground mt-1">Click any account to view its full transaction history and running balance.</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {typeOrder.map(type => {
            const accs = grouped[type];
            if (!accs || accs.length === 0) return null;
            return (
              <div key={type} className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground capitalize flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${typeColor[type] ?? ""}`}>{type}</span>
                  Accounts
                </h2>
                <div className="border rounded-md bg-card overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Account Name</TableHead>
                        <TableHead className="text-right">Total Debits</TableHead>
                        <TableHead className="text-right">Total Credits</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accs.map(acc => {
                        const balance = acc.balance || 0;
                        return (
                          <TableRow
                            key={acc.id}
                            className="cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => setSelectedAccountId(acc.id)}
                          >
                            <TableCell className="font-mono text-muted-foreground">{acc.code}</TableCell>
                            <TableCell className="font-medium">
                              {acc.name}
                              {acc.isSystem && <Badge variant="outline" className="text-[10px] ml-2">System</Badge>}
                            </TableCell>
                            <TableCell className="text-right text-blue-600 font-medium">
                              ₨{(balance > 0 ? balance : 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right text-green-600 font-medium">
                              ₨{(balance < 0 ? Math.abs(balance) : 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              <span className={balance > 0 ? "text-primary" : balance < 0 ? "text-destructive" : "text-muted-foreground"}>
                                ₨{Math.abs(balance).toFixed(2)}
                                {balance > 0 ? <TrendingUp className="inline w-3 h-3 ml-1" /> : balance < 0 ? <TrendingDown className="inline w-3 h-3 ml-1" /> : <Minus className="inline w-3 h-3 ml-1" />}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-xs text-muted-foreground hover:text-primary">View →</span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
