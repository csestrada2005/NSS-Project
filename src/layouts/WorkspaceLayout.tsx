import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import AppSidebar from '@/components/AppSidebar';
import { Topbar } from '@/components/Topbar';
import { Loader2 } from 'lucide-react';
import SetupPage from '@/pages/SetupPage';
import RoleSelectionPage from '@/pages/RoleSelectionPage';
import PendingApprovalPage from '@/pages/PendingApprovalPage';

export function WorkspaceLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading, profile, pendingApproval } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!profile?.role) {
    if (pendingApproval) {
      return (
        <LanguageProvider>
          <PendingApprovalPage />
        </LanguageProvider>
      );
    }

    if (profile && !profile.pending_role) {
      return (
        <LanguageProvider>
          <RoleSelectionPage />
        </LanguageProvider>
      );
    }

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
