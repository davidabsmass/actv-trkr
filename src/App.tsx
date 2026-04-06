import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import AppLayout from "@/components/AppLayout";
import AutoTranslateDom from "@/components/i18n/AutoTranslateDom";

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
const Checkout = lazy(() => import("./pages/Checkout"));
const CheckoutSuccess = lazy(() => import("./pages/CheckoutSuccess"));
const OwnerAdmin = lazy(() => import("./pages/OwnerAdmin"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));

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

function isPreviewEnvironment() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host.includes("lovableproject.com") || host.includes("id-preview--");
}

const OWNER_EMAIL = "david@newuniformdesign.com";

function isOwnerEmail(email?: string | null) {
  return email?.toLowerCase() === OWNER_EMAIL.toLowerCase();
}

function ProtectedRoute({ children, requireSubscription = true }: { children: React.ReactNode; requireSubscription?: boolean }) {
  const isPreview = isPreviewEnvironment();
  const { session, loading } = useAuth();
  const isOwner = isOwnerEmail(session?.user?.email);
  const subscriptionUserId = !isPreview && !isOwner ? session?.user?.id : undefined;
  const { subscribed, billingExempt, isLoading: subLoading } = useSubscription(subscriptionUserId);

  if (isPreview) return <>{children}</>;
  if (loading) return <PageSpinner />;
  if (!session) return <Navigate to="/auth" replace />;

  if (isOwner) return <>{children}</>;

  if (subLoading) return <PageSpinner />;

  if (requireSubscription && !billingExempt && !subscribed) {
    return <Navigate to="/checkout" replace />;
  }

  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const isPreview = isPreviewEnvironment();
  const { session, loading } = useAuth();
  const isOwner = isOwnerEmail(session?.user?.email);
  const subscriptionUserId = !isPreview && !isOwner ? session?.user?.id : undefined;
  const { subscribed, billingExempt, isLoading: subLoading } = useSubscription(subscriptionUserId);

  if (isPreview) return <>{children}</>;
  if (loading) return <PageSpinner />;
  if (!session) return <>{children}</>;
  if (isOwner) return <Navigate to="/admin-setup" replace />;
  if (subLoading) return <PageSpinner />;
  if (billingExempt || subscribed) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<PageSpinner />}>
          <AutoTranslateDom />
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
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/checkout-success" element={<CheckoutSuccess />} />
            <Route path="/owner-admin" element={<OwnerAdmin />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/unsubscribe" element={<Unsubscribe />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
