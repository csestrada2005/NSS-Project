import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { AppSidebar } from '@/components/AppSidebar';
import { Topbar } from '@/components/Topbar';
import { BottomNav } from '@/components/BottomNav';

export function WorkspaceLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <LanguageProvider>
      <AuthProvider>
        <div className="flex h-screen w-screen bg-background text-foreground overflow-hidden">
          <AppSidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
          <div className="flex flex-col flex-1 overflow-hidden min-w-0">
            <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
            <main className="flex-1 overflow-auto">
              <Outlet />
            </main>
            <BottomNav />
          </div>
        </div>
      </AuthProvider>
    </LanguageProvider>
  );
}