import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Package, 
  Boxes, 
  MonitorPlay, 
  Receipt, 
  Landmark, 
  BookOpen, 
  Users, 
  CreditCard, 
  PieChart, 
  Settings 
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Package },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/pos", label: "Point of Sale", icon: MonitorPlay },
  { href: "/sales", label: "Sales History", icon: Receipt },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/journals", label: "Journals", icon: BookOpen },
  { href: "/vendors", label: "Vendors", icon: Users },
  { href: "/expenses", label: "Expenses", icon: CreditCard },
  { href: "/analytics", label: "Analytics", icon: PieChart },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="w-64 border-r border-border bg-sidebar h-screen sticky top-0 flex flex-col">
      <div className="h-16 flex items-center px-6 border-b border-border bg-sidebar-primary text-sidebar-primary-foreground">
        <h1 className="font-bold text-xl tracking-tight flex items-center gap-2">
          <MonitorPlay className="w-6 h-6" />
          MediERP
        </h1>
      </div>
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
              isActive 
                ? "bg-primary/10 text-primary" 
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}>
              <item.icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
