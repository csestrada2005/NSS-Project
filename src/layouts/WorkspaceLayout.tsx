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

  if (loading || (user && profile === null)) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 size={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

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
