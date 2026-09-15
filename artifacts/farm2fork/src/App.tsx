import { type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppShell, type AppRole } from '@/components/farm-shell';
import { AuthProvider, useAuth } from '@/lib/auth';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LanguageProvider } from '@/i18n';
import NotFound from '@/pages/not-found';
import { MessagesPage } from '@/pages/messages';
import { NotificationsPage } from '@/pages/notifications';
import { EditProfilePage, ProfilePage, PublicProfilePage } from '@/pages/profile';
import { MessageNotificationWatcher } from '@/hooks/useMessages';
import { AdminLogin, BuyerDashboard, CropDetail, CropListings, FarmerDashboard, ForgotPassword, Home, Insights, Logistics, Login, Marketplace, OrderDetail, Orders, Register, ResetPassword, SellCrop } from '@/pages/farm-pages';
import { AdminPage } from '@/pages/admin';
import { AdminEditorialPage } from '@/pages/admin-editorial';
import { DriverDashboard } from '@/pages/driver';
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
    if (nextRole === 'farmer') setLocation('/farmer');
    else if (nextRole === 'admin') setLocation('/admin');
    else if (nextRole === 'driver') setLocation('/driver');
    else setLocation('/buyer');
  };
  const role = appRole ?? entryRole;
  const handleSignOut = async () => {
    await signOut();
    queryClient.clear();
    setLocation('/');
  };
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/"><Home role={role} onRole={handleRole} /></Route>
        <Route path="/login"><Login onRole={handleRole} /></Route>
        <Route path="/admin/login"><AdminLogin onRole={handleRole} /></Route>
        <Route path="/admin-login"><AdminLogin onRole={handleRole} /></Route>
        <Route path="/register"><Register onRole={handleRole} /></Route>
        <Route path="/forgot-password"><ForgotPassword /></Route>
        <Route path="/reset-password"><ResetPassword /></Route>
        <Route path="/farmer"><ProtectedRoute roles={['FARMER']}><AppShell role="farmer" onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Farmer workspace'}><FarmerDashboard /></AppShell></ProtectedRoute></Route>
        <Route path="/farmer/dashboard"><ProtectedRoute roles={['FARMER']}><AppShell role="farmer" onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Farmer workspace'}><FarmerDashboard /></AppShell></ProtectedRoute></Route>
        <Route path="/farmer/sell"><ProtectedRoute roles={['FARMER']}><AppShell role="farmer" onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Farmer workspace'}><SellCrop /></AppShell></ProtectedRoute></Route>
        <Route path="/farmer/crops"><ProtectedRoute roles={['FARMER']}><AppShell role="farmer" onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Farmer workspace'}><CropListings /></AppShell></ProtectedRoute></Route>
        <Route path="/marketplace/:id"><ProtectedRoute roles={['BUYER', 'CONSUMER', 'ADMIN']}><AppShell role={role} onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Marketplace workspace'}><CropDetail /></AppShell></ProtectedRoute></Route>
        <Route path="/marketplace"><ProtectedRoute roles={['BUYER', 'CONSUMER', 'ADMIN']}><AppShell role={role} onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Marketplace workspace'}><Marketplace /></AppShell></ProtectedRoute></Route>
        <Route path="/buyer"><ProtectedRoute roles={['BUYER', 'CONSUMER']}><AppShell role={role} onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Bulk Buyer workspace'}><BuyerDashboard /></AppShell></ProtectedRoute></Route>
        <Route path="/driver"><ProtectedRoute roles={['DRIVER']}><AppShell role="driver" onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Driver workspace'}><DriverDashboard /></AppShell></ProtectedRoute></Route>
        <Route path="/orders"><ProtectedRoute roles={['FARMER', 'BUYER', 'CONSUMER', 'ADMIN']}><AppShell role={role} onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Farm2Fork workspace'}><Orders role={role} /></AppShell></ProtectedRoute></Route>
        <Route path="/orders/:id"><ProtectedRoute roles={['FARMER', 'BUYER', 'CONSUMER', 'ADMIN']}><AppShell role={role} onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Farm2Fork workspace'}><OrderDetail /></AppShell></ProtectedRoute></Route>
        <Route path="/messages"><ProtectedRoute roles={['FARMER', 'BUYER', 'CONSUMER', 'DRIVER']}><AppShell role={role} onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Farm2Fork workspace'}><MessagesPage /></AppShell></ProtectedRoute></Route>
        <Route path="/notifications"><ProtectedRoute roles={['FARMER', 'BUYER', 'CONSUMER', 'DRIVER']}><AppShell role={role} onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Farm2Fork workspace'}><NotificationsPage /></AppShell></ProtectedRoute></Route>
        <Route path="/profile"><ProtectedRoute roles={['FARMER', 'BUYER', 'CONSUMER', 'DRIVER']}><AppShell role={role} onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Farm2Fork workspace'}><ProfilePage /></AppShell></ProtectedRoute></Route>
        <Route path="/profile/edit"><ProtectedRoute roles={['FARMER', 'BUYER', 'CONSUMER', 'DRIVER']}><AppShell role={role} onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Farm2Fork workspace'}><EditProfilePage /></AppShell></ProtectedRoute></Route>
        <Route path="/profile/:userId"><ProtectedRoute roles={['FARMER', 'BUYER', 'CONSUMER']}><AppShell role={role} onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Farm2Fork workspace'}><PublicProfilePage /></AppShell></ProtectedRoute></Route>
        <Route path="/insights"><ProtectedRoute roles={['FARMER', 'BUYER', 'ADMIN']}><AppShell role={role} onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Farm2Fork workspace'}><Insights /></AppShell></ProtectedRoute></Route>
        <Route path="/logistics"><ProtectedRoute roles={['FARMER', 'BUYER', 'ADMIN']}><AppShell role={role} onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Farm2Fork workspace'}><Logistics /></AppShell></ProtectedRoute></Route>
        <Route path="/admin/editorial"><ProtectedRoute roles={['ADMIN']}><AppShell role="admin" onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Admin workspace'}><AdminEditorialPage /></AppShell></ProtectedRoute></Route>
        <Route path="/admin"><ProtectedRoute roles={['ADMIN']}><AppShell role="admin" onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Admin workspace'}><AdminPage /></AppShell></ProtectedRoute></Route>
        <Route path="/admin/:section"><ProtectedRoute roles={['ADMIN']}><AppShell role="admin" onRole={handleRole} onSignOut={handleSignOut} displayName={profile?.email ?? 'Admin workspace'}><AdminPage /></AppShell></ProtectedRoute></Route>
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function ProtectedRoute({ roles, children }: { roles: AuthRole[]; children: ReactNode }) {
  const { isAuthenticated, isLoading, profile, error } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setLocation(roles.includes('ADMIN') && roles.length === 1 ? '/admin-login' : '/login');
      return;
    }
    if (profile && !roles.includes(profile.role)) {
      setLocation(
        profile.role === 'FARMER'
          ? '/farmer'
          : profile.role === 'BUYER' || profile.role === 'CONSUMER'
            ? '/buyer'
            : profile.role === 'DRIVER'
              ? '/driver'
              : '/admin',
      );
    }
  }, [isAuthenticated, isLoading, profile, roles, setLocation]);

  if (isLoading) return <AuthGateState title="Restoring your secure session..." detail="Checking your Farm2Fork account." />;
  if (error) return <AuthGateState title="We could not restore your session" detail={error} action={() => setLocation('/login')} />;
  if (!isAuthenticated || !profile) return <AuthGateState title="Sign in to continue" detail="This workspace requires an authenticated Farm2Fork account." action={() => setLocation(roles.includes('ADMIN') && roles.length === 1 ? '/admin-login' : '/login')} />;
  if (!roles.includes(profile.role)) return <AuthGateState title="Workspace unavailable" detail="Your account does not have access to this workspace." action={() => setLocation(profile.role === 'FARMER' ? '/farmer' : profile.role === 'BUYER' || profile.role === 'CONSUMER' ? '/buyer' : profile.role === 'DRIVER' ? '/driver' : '/admin')} />;
  return <>{children}</>;
}

function AuthGateState({ title, detail, action }: { title: string; detail: string; action?: () => void }) {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--background))] px-6"><div className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 text-center"><div className="font-display text-2xl font-bold">{title}</div><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{detail}</p>{action && <button type="button" onClick={action} className="mt-5 rounded-xl bg-[hsl(var(--primary))] px-4 py-3 text-sm font-bold text-white">Go to sign in</button>}</div></div>;
}

type AuthRole = 'FARMER' | 'BUYER' | 'CONSUMER' | 'DRIVER' | 'ADMIN';

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
              <MessageNotificationWatcher />
            </WouterRouter>
          </LanguageProvider>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
