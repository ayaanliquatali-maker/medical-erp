import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAdmin } from "@/context/admin";
import {
  LayoutDashboard,
  Package,
  Receipt,
  Landmark,
  Settings,
  ChevronDown,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type NavGroup = {
  label: string;
  icon: React.ElementType;
  href?: string;
  children: { href: string; label: string; icon?: React.ElementType }[];
};

const navGroups: NavGroup[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/", children: [] },
  {
    label: "Inventory", icon: Package, href: "/inventory",
    children: [
      { href: "/purchase", label: "Purchase", icon: Package },
      { href: "/vendors", label: "Vendors" },
    ],
  },
  {
    label: "Sales", icon: Receipt, href: "/sales",
    children: [
      { href: "/sales-history", label: "Sales History" },
    ],
  },
  {
    label: "Accounts", icon: Landmark, href: "/accounts",
    children: [
      { href: "/expenses", label: "Expenses" },
      { href: "/journals", label: "Journals" },
      { href: "/ledger", label: "General Ledger" },
      { href: "/analytics", label: "Analytics" },
    ],
  },
  { label: "Settings", icon: Settings, href: "/settings", children: [] },
];

function NavItem({ group, location, isAdmin }: { group: NavGroup; location: string; isAdmin: boolean }) {
  const isActive = group.href
    ? location === group.href || (group.href !== "/" && location.startsWith(group.href))
    : false;

  if (group.children.length === 0) {
    return (
      <Link
        href={group.href!}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <group.icon className="w-4 h-4" />
        {group.label}
      </Link>
    );
  }

  const childActive = group.children.some(
    c => location === c.href || (c.href !== "/" && location.startsWith(c.href))
  );

  return (
    <div className="relative group">
      <button
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap",
          (isActive || childActive)
            ? "bg-primary/10 text-primary"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <group.icon className="w-4 h-4" />
        {group.label}
        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>
      <div className="absolute top-full left-0 pt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
        <div className="min-w-[160px] bg-popover border border-border rounded-lg shadow-lg py-1">
          {group.href && (
            <Link
              href={group.href}
              className="flex items-center px-3 py-1.5 text-sm font-medium text-popover-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer"
            >
              {group.label}
            </Link>
          )}
          {group.href && group.children.length > 0 && <div className="h-px bg-border mx-2 my-1" />}
          {group.children.map(child => (
            <Link
              key={child.href}
              href={child.href}
              className="flex items-center px-3 py-1.5 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer"
            >
              {child.label}
            </Link>
          ))}
          {group.label === "Accounts" && isAdmin && (
            <>
              {group.children.length > 0 && <div className="h-px bg-border mx-2 my-1" />}
              <Link
                href="/audit"
                className="flex items-center px-3 py-1.5 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer"
              >
                Audit Trail
              </Link>
            </>
          )}
          {group.label === "Sales" && isAdmin && (
            <>
              {group.children.length > 0 && <div className="h-px bg-border mx-2 my-1" />}
              <Link
                href="/sales-return"
                className="flex items-center px-3 py-1.5 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer"
              >
                Sales Returns
              </Link>
            </>
          )}
          {group.label === "Inventory" && isAdmin && (
            <>
              {group.children.length > 0 && <div className="h-px bg-border mx-2 my-1" />}
              <Link
                href="/purchase-return"
                className="flex items-center px-3 py-1.5 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer"
              >
                Purchase Returns
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function Navbar() {
  const [location] = useLocation();
  const { isAdmin, login, logout } = useAdmin();
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminPwd, setAdminPwd] = useState("");
  const [adminErr, setAdminErr] = useState<string | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);

  const handleAdminLogin = async () => {
    setAdminErr(null);
    setAdminBusy(true);
    try {
      await login(adminPwd);
      setShowAdmin(false);
    } catch (err) {
      setAdminErr((err as Error).message || "Unable to sign in");
    } finally {
      setAdminBusy(false);
    }
  };

  return (
    <header className="h-14 border-b border-border bg-sidebar sticky top-0 z-40">
      <div className="max-w-screen-2xl mx-auto px-4 h-full flex items-center gap-1">
        <Link href="/" className="flex items-center gap-2 mr-6 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-xs font-bold text-primary-foreground">M</span>
          </div>
          <span className="font-bold text-base text-foreground">MediERP</span>
        </Link>

        <nav className="flex items-center gap-0.5 flex-1 overflow-visible">
          {navGroups.map((group) => (
            <NavItem key={group.label} group={group} location={location} isAdmin={isAdmin} />
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          <Button
            variant={isAdmin ? "default" : "outline"}
            size="sm"
            onClick={() => {
              if (isAdmin) {
                logout();
              } else {
                setShowAdmin(true);
              }
            }}
            className="rounded-full text-xs h-8"
          >
            {isAdmin ? "Admin" : "Login"}
          </Button>
        </div>
      </div>

      {showAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAdmin(false)}>
          <div className="bg-card border rounded-xl shadow-xl p-6 w-80 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-1">Admin Login</h3>
            <p className="text-xs text-muted-foreground mb-4">Enter the admin password to access restricted features.</p>
            <input
              type="password"
              className="flex h-9 w-full rounded-lg border border-input bg-card/50 px-3 py-1 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-ring/30"
              value={adminPwd}
              onChange={e => setAdminPwd(e.target.value)}
              placeholder="Password"
              onKeyDown={e => e.key === "Enter" && handleAdminLogin()}
            />
            {adminErr && <p className="text-xs text-destructive mb-2">{adminErr}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowAdmin(false)}>Cancel</Button>
              <Button size="sm" onClick={handleAdminLogin} disabled={adminBusy}>{adminBusy ? "..." : "Sign in"}</Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
