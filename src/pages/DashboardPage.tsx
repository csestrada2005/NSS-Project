import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useViewMode } from "@/contexts/ViewModeContext";
import AdminDashboard from "@/pages/dashboard/AdminDashboard";
import DevDashboard from "@/pages/dashboard/DevDashboard";
import ClientDashboard from "@/pages/dashboard/ClientDashboard";

const DashboardPage = () => {
  const { loading, isAdmin, isDev, isVendedor, isCliente } = useAuth();
  const { viewMode } = useViewMode();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isAdmin) {
    // Admin can toggle to see the dev dashboard view
    return viewMode === 'dev' ? <DevDashboard /> : <AdminDashboard />;
  }
  if (isDev || isVendedor) return <DevDashboard />;
  if (isCliente) return <ClientDashboard />;

  // Fallback for any unrecognised role
  return <DevDashboard />;
};

export default DashboardPage;
