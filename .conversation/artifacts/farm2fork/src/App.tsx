import { type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppShell, type AppRole } from '@/components/farm-shell';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LanguageProvider } from '@/i18n';
import NotFound from '@/pages/not-found';
import { Admin, BuyerDashboard, CropDetail, CropListings, FarmerDashboard, ForgotPassword, Home, Insights, Logistics, Login, Marketplace, Orders, Register, SellCrop } from '@/pages/farm-pages';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  const [role, setRole] = useState<AppRole>(() => (localStorage.getItem('farm2fork-role') as AppRole) || 'farmer');
  const [, setLocation] = useLocation();
  useEffect(() => { localStorage.setItem('farm2fork-role', role); }, [role]);
  const handleRole = (nextRole: AppRole) => {
    setRole(nextRole);
    setLocation(nextRole === 'farmer' ? '/farmer' : nextRole === 'buyer' ? '/buyer' : '/admin');
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
        <Route path="/farmer"><AppShell role={role} onRole={handleRole}><FarmerDashboard /></AppShell></Route>
        <Route path="/farmer/dashboard"><AppShell role={role} onRole={handleRole}><FarmerDashboard /></AppShell></Route>
        <Route path="/farmer/sell"><AppShell role={role} onRole={handleRole}><SellCrop /></AppShell></Route>
        <Route path="/farmer/crops"><AppShell role={role} onRole={handleRole}><CropListings /></AppShell></Route>
        <Route path="/marketplace/:id"><AppShell role={role} onRole={handleRole}><CropDetail /></AppShell></Route>
        <Route path="/marketplace"><AppShell role={role} onRole={handleRole}><Marketplace /></AppShell></Route>
        <Route path="/buyer"><AppShell role={role} onRole={handleRole}><BuyerDashboard /></AppShell></Route>
        <Route path="/orders"><AppShell role={role} onRole={handleRole}><Orders role={role} /></AppShell></Route>
        <Route path="/insights"><AppShell role={role} onRole={handleRole}><Insights /></AppShell></Route>
        <Route path="/logistics"><AppShell role={role} onRole={handleRole}><Logistics /></AppShell></Route>
        <Route path="/admin"><AppShell role={role} onRole={handleRole}><Admin /></AppShell></Route>
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LanguageProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
        </LanguageProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
