import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdmin } from "@/context/admin";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

type AuditLog = {
  id: number;
  action: string;
  entity: string;
  entityId: number | null;
  details: string;
  actor: string;
  createdAt: string;
};

function apiUrl(path: string): string {
  const base = import.meta.env.VITE_API_URL;
  if (!base) return `/api${path}`;
  return `${base.replace(/\/+$/, "")}/api${path}`;
}

const fetchAuditLogs = async (): Promise<AuditLog[]> => {
  const res = await fetch(apiUrl("/admin/audit-logs"), { credentials: "include" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || "Failed to load audit logs");
  }
  return res.json();
};

const formatDetails = (details: string) => {
  try {
    const parsed = JSON.parse(details);
    if (typeof parsed === "string") return parsed;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return details;
  }
};

const clearAuditLogs = async (): Promise<void> => {
  const res = await fetch(apiUrl("/admin/audit-logs/clear"), { method: "POST", credentials: "include" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || "Failed to clear audit logs");
  }
};

export default function AuditTrail() {
  const { isAdmin, checking } = useAdmin();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["auditLogs"],
    queryFn: fetchAuditLogs,
    enabled: isAdmin && !checking,
    staleTime: 1000 * 60,
  });

  const clearMutation = useMutation({
    mutationFn: clearAuditLogs,
    onSuccess: async () => {
      toast({ title: "Audit trail cleared" });
      await queryClient.invalidateQueries({ queryKey: ["auditLogs"] });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Failed to clear audit logs";
      toast({ title: message, variant: "destructive" });
    },
  });

  const logs = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  if (checking) {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h1 className="text-2xl font-bold tracking-tight">Audit Trail</h1>
        <p className="text-sm text-muted-foreground">Checking admin access...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h1 className="text-2xl font-bold tracking-tight">Audit Trail</h1>
        <p className="text-sm text-muted-foreground">This section is only visible to admins.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Trail</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Recent admin actions and changes with timestamps.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => queryClient.invalidateQueries({ queryKey: ["auditLogs"] })}>
            Refresh
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (!window.confirm("Clear all audit logs? This cannot be undone.")) return;
              clearMutation.mutate();
            }}
            disabled={clearMutation.isPending}
          >
            {clearMutation.isPending ? "Clearing..." : "Clear Audit Trail"}
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-border bg-muted p-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Admin-only audit logs</p>
          <p className="text-xs text-muted-foreground">Showing the most recent 100 audit entries.</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          <p className="font-medium">Unable to load audit trail</p>
          <p className="text-sm">{(error as Error).message}</p>
        </div>
      ) : null}

      <div className="border rounded-md bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>Actor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? [...Array(8)].map((_, index) => (
              <TableRow key={index}>
                {[...Array(5)].map((_, cellIndex) => (
                  <TableCell key={cellIndex}><Skeleton className="h-4 w-full" /></TableCell>
                ))}
              </TableRow>
            )) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                  No audit logs available.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{format(new Date(log.createdAt), "PPpp")}</TableCell>
                  <TableCell>{log.action}</TableCell>
                  <TableCell>
                    {log.entity}{log.entityId ? ` #${log.entityId}` : ""}
                  </TableCell>
                  <TableCell>
                    <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{formatDetails(log.details)}</pre>
                  </TableCell>
                  <TableCell>{log.actor}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
