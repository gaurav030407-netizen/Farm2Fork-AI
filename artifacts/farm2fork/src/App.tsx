import { type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppShell, type AppRole } from '@/components/farm-shell';
import { AuthProvider, useAuth } from '@/lib/auth';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LanguageProvider } from '@/i18n';
import NotFound from '@/pages/not-found';
import { Admin, BuyerDashboard, CropDetail, CropListings, FarmerDashboard, ForgotPassword, Home, Insights, Logistics, Login, Marketplace, Orders, Register, ResetPassword, SellCrop } from '@/pages/farm-pages';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  const { appRole, isAuthenticated, isLoading, profile, signOut } = useAuth();
  const [entryRole, setEntryRole] = useState<AppRole>('farmer');
  const [, setLocation] = useLocation();
  const handleRole = (nextRole: AppRole) => {
    setEntryRole(nextRole);
    setLocation(nextRole === 'farmer' ? '/farmer' : nextRole === 'buyer' ? '/buyer' : '/admin');
  };
  const role = appRole ?? entryRole;
  const handleSignOut = async () => {
    await signOut();
    queryClient.clear();
    setLocation('/login');
  };
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/"><Home role={role} onRole={handleRole} /></Route>
        <Route path="/login"><Login onRole={handleRole} /></Route>
        <Route path="/register"><Register onRole={handleRole} /></Route>
        <Route path="/forgot-password"><ForgotPassword /></Route>
        <Route path="/reset-password"><ResetPassword /></Route>
        <Route path="/farmer"><ProtectedRoute roles={['FARMER']}><AppShell role="farmer" onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Farmer workspace'}><FarmerDashboard /></AppShell></ProtectedRoute></Route>
        <Route path="/farmer/dashboard"><ProtectedRoute roles={['FARMER']}><AppShell role="farmer" onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Farmer workspace'}><FarmerDashboard /></AppShell></ProtectedRoute></Route>
        <Route path="/farmer/sell"><ProtectedRoute roles={['FARMER']}><AppShell role="farmer" onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Farmer workspace'}><SellCrop /></AppShell></ProtectedRoute></Route>
        <Route path="/farmer/crops"><ProtectedRoute roles={['FARMER']}><AppShell role="farmer" onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Farmer workspace'}><CropListings /></AppShell></ProtectedRoute></Route>
        <Route path="/marketplace/:id"><ProtectedRoute roles={['BUYER', 'ADMIN']}><AppShell role={role} onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Marketplace workspace'}><CropDetail /></AppShell></ProtectedRoute></Route>
        <Route path="/marketplace"><ProtectedRoute roles={['BUYER', 'ADMIN']}><AppShell role={role} onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Marketplace workspace'}><Marketplace /></AppShell></ProtectedRoute></Route>
        <Route path="/buyer"><ProtectedRoute roles={['BUYER']}><AppShell role="buyer" onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Buyer workspace'}><BuyerDashboard /></AppShell></ProtectedRoute></Route>
        <Route path="/orders"><ProtectedRoute roles={['FARMER', 'BUYER', 'ADMIN']}><AppShell role={role} onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Farm2Fork workspace'}><Orders role={role} /></AppShell></ProtectedRoute></Route>
        <Route path="/insights"><ProtectedRoute roles={['FARMER', 'BUYER', 'ADMIN']}><AppShell role={role} onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Farm2Fork workspace'}><Insights /></AppShell></ProtectedRoute></Route>
        <Route path="/logistics"><ProtectedRoute roles={['FARMER', 'BUYER', 'ADMIN']}><AppShell role={role} onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Farm2Fork workspace'}><Logistics /></AppShell></ProtectedRoute></Route>
        <Route path="/admin"><ProtectedRoute roles={['ADMIN']}><AppShell role="admin" onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Admin workspace'}><Admin /></AppShell></ProtectedRoute></Route>
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function ProtectedRoute({ roles, children }: { roles: AuthRole[]; children: ReactNode }) {
  const { isAuthenticated, isLoading, profile } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setLocation('/login');
      return;
    }
    if (profile && !roles.includes(profile.role)) {
      setLocation(profile.role === 'FARMER' ? '/farmer' : profile.role === 'BUYER' ? '/buyer' : '/admin');
    }
  }, [isAuthenticated, isLoading, profile, roles, setLocation]);

  if (isLoading || !isAuthenticated || !profile || !roles.includes(profile.role)) {
    return <div className="min-h-[100dvh] bg-[hsl(var(--background))]" />;
  }
  return <>{children}</>;
}

type AuthRole = 'FARMER' | 'BUYER' | 'ADMIN';

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <LanguageProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <Router />
            </WouterRouter>
          </LanguageProvider>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
