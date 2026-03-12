import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { AuthProvider } from '@/contexts/AuthContext';
import AppSidebar from '@/components/AppSidebar';
import { Topbar } from '@/components/Topbar';

export function WorkspaceLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <LanguageProvider>
      <AuthProvider>
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
      </AuthProvider>
    </LanguageProvider>
  );
}
