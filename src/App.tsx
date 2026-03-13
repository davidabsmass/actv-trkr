import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import AppLayout from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Performance from "./pages/Performance";
import Forms from "./pages/Forms";
import Reports from "./pages/Reports";
import Exports from "./pages/Exports";
import Archives from "./pages/Archives";
import Clients from "./pages/Clients";
import SettingsPage from "./pages/Settings";
import AdminSetup from "./pages/AdminSetup";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Signup from "./pages/Signup";
import NotFound from "./pages/NotFound";
import SnapshotView from "./pages/SnapshotView";
import ResetPassword from "./pages/ResetPassword";
import Monitoring from "./pages/Monitoring";
import Notifications from "./pages/Notifications";
import Account from "./pages/Account";
import Index from "./pages/Index";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (session) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function LandingRoute() {
  return <Index />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route index element={<LandingRoute />} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="performance" element={<Performance />} />
            <Route path="forms" element={<Forms />} />
            <Route path="entries" element={<Navigate to="/forms" replace />} />
            <Route path="reports" element={<Navigate to="/performance?tab=reports" replace />} />
            <Route path="exports" element={<Exports />} />
            <Route path="archives" element={<Archives />} />
            <Route path="clients" element={<Clients />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="monitoring" element={<Monitoring />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="admin-setup" element={<AdminSetup />} />
            <Route path="account" element={<Account />} />
          </Route>
          <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
          <Route path="/snapshot/:id" element={<SnapshotView />} />
          <Route path="/signup" element={<AuthRoute><Signup /></AuthRoute>} />
          <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
