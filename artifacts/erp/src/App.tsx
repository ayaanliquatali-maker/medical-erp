import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminProvider } from "@/context/admin";

import Dashboard from "@/pages/Dashboard";
import InventoryPage from "@/pages/Products";
import PurchasePage from "@/pages/Inventory";
import SalesPage from "@/pages/POS";
import SalesHistoryPage from "@/pages/Sales";
import Accounts from "@/pages/Accounts";
import Journals from "@/pages/Journals";
import Vendors from "@/pages/Vendors";
import Expenses from "@/pages/Expenses";
import Analytics from "@/pages/Analytics";
import Settings from "@/pages/Settings";
import AuditTrail from "@/pages/AuditTrail";
import GeneralLedger from "@/pages/GeneralLedger";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/inventory" component={InventoryPage} />
        <Route path="/purchase" component={PurchasePage} />
        <Route path="/sales" component={SalesPage} />
        <Route path="/sales-history" component={SalesHistoryPage} />
        <Route path="/accounts" component={Accounts} />
        <Route path="/journals" component={Journals} />
        <Route path="/ledger" component={GeneralLedger} />
        <Route path="/vendors" component={Vendors} />
        <Route path="/expenses" component={Expenses} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/audit" component={AuditTrail} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}> 
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AdminProvider>
    </QueryClientProvider>
  );
}

export default App;
