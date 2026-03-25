import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import AppLayout from "@/components/AppLayout";

// ── Lazy-loaded pages (route-level code splitting) ──
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Performance = lazy(() => import("./pages/Performance"));
const Forms = lazy(() => import("./pages/Forms"));
const Reports = lazy(() => import("./pages/Reports"));
const Exports = lazy(() => import("./pages/Exports"));
const Seo = lazy(() => import("./pages/Seo"));
const Clients = lazy(() => import("./pages/Clients"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const AdminSetup = lazy(() => import("./pages/AdminSetup"));
const Auth = lazy(() => import("./pages/Auth"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Signup = lazy(() => import("./pages/Signup"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SnapshotView = lazy(() => import("./pages/SnapshotView"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Monitoring = lazy(() => import("./pages/Monitoring"));
const Security = lazy(() => import("./pages/Security"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Account = lazy(() => import("./pages/Account"));
const GetStarted = lazy(() => import("./pages/GetStarted"));
const Index = lazy(() => import("./pages/Index"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function PageSpinner() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <PageSpinner />;
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <PageSpinner />;
  if (session) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<PageSpinner />}>
          <Routes>
            <Route index element={<Index />} />
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
              <Route path="reports" element={<Reports />} />
              <Route path="exports" element={<Exports />} />
              <Route path="archives" element={<Navigate to="/reports?tab=archives" replace />} />
              <Route path="seo" element={<Seo />} />
              <Route path="clients" element={<Clients />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="monitoring" element={<Monitoring />} />
              <Route path="security" element={<Security />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="admin-setup" element={<AdminSetup />} />
              <Route path="account" element={<Account />} />
              <Route path="get-started" element={<GetStarted />} />
              <Route path="website-setup" element={<Navigate to="/settings?tab=setup" replace />} />
            </Route>
            <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
            <Route path="/snapshot/:id" element={<SnapshotView />} />
            <Route path="/signup" element={<AuthRoute><Signup /></AuthRoute>} />
            <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
