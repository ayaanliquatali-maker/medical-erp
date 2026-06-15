import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";

type AdminContextValue = {
  isAdmin: boolean;
  checking: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AdminContext = createContext<AdminContextValue | undefined>(undefined);

function getAdminUrl(path: string): string {
  const base = import.meta.env.VITE_API_URL;
  if (!base) return `/api/admin${path}`;
  return `${base.replace(/\/+$/, "")}/api/admin${path}`;
}

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let active = true;
    const fetchStatus = async () => {
      try {
        const response = await fetch(getAdminUrl("/status"), { credentials: "include" });
        if (!active) return;
        if (!response.ok) {
          setIsAdmin(false);
          return;
        }
        const body = await response.json();
        setIsAdmin(Boolean(body?.isAdmin));
      } catch {
        setIsAdmin(false);
      } finally {
        if (active) setChecking(false);
      }
    };
    fetchStatus();
    return () => {
      active = false;
    };
  }, []);

  const login = async (password: string) => {
    const response = await fetch(getAdminUrl("/login"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message = body?.error || "Invalid admin password";
      toast({ title: message, variant: "destructive" });
      throw new Error(message);
    }

    setIsAdmin(true);
    toast({ title: "Admin access granted" });
  };

  const logout = async () => {
    try {
      const response = await fetch(getAdminUrl("/logout"), {
        method: "POST",
        credentials: "include",
      });
      if (response.ok) {
        setIsAdmin(false);
        toast({ title: "Admin signed out" });
      }
    } catch {
      setIsAdmin(false);
    }
  };

  const value = useMemo(
    () => ({ isAdmin, checking, login, logout }),
    [isAdmin, checking],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
}
