import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import AppSidebar from '@/components/AppSidebar';
import { Topbar } from '@/components/Topbar';
import { Loader2 } from 'lucide-react';
import SetupPage from '@/pages/SetupPage';

export function WorkspaceLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading, profile } = useAuth();

  // Safe to use plain `loading` here because AuthContext guarantees that
  // loading stays true until BOTH user AND profile are fully resolved.
  // The old `(user && !profileSettled)` guard is no longer needed.
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 size={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // At this point loading is false AND user is set, so profile has been
  // fetched (or confirmed absent).  A missing role means the account is
  // genuinely not configured — not a race condition.
  if (!profile?.role) {
    return (
      <LanguageProvider>
        <SetupPage />
      </LanguageProvider>
    );
  }

  return (
    <LanguageProvider>
      <div className="h-screen flex overflow-hidden bg-background">
        <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Topbar onToggleSidebar={() => setSidebarOpen((p) => !p)} />
          <main className="flex-1 overflow-y-auto p-6 md:p-8 pb-20 lg:pb-8">
            <div className="animate-fade-in">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </LanguageProvider>
  );
}
