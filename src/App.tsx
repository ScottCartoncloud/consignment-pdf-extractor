import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppSidebar from "@/components/AppSidebar";
import TenantsListPage from "./pages/TenantsListPage";
import TenantDetailPage from "./pages/TenantDetailPage";
import CustomersListPage from "./pages/CustomersListPage";
import CustomerDetailPage from "./pages/CustomerDetailPage";
import ActivityLogPage from "./pages/ActivityLogPage";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <div className="flex min-h-screen">
          <AppSidebar />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Navigate to="/tenants" replace />} />
              <Route path="/tenants" element={<TenantsListPage />} />
              <Route path="/tenants/:id" element={<TenantDetailPage />} />
              <Route path="/profiles" element={<CustomersListPage />} />
              <Route path="/profiles/:id" element={<CustomerDetailPage />} />
              <Route path="/log" element={<ActivityLogPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
