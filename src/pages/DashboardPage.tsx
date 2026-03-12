import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import AdminDashboard from "@/pages/dashboard/AdminDashboard";
import DevDashboard from "@/pages/dashboard/DevDashboard";
import ClientDashboard from "@/pages/dashboard/ClientDashboard";

const DashboardPage = () => {
  const { loading, isAdmin, isDev, isVendedor, isCliente } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isAdmin) return <AdminDashboard />;
  if (isDev || isVendedor) return <DevDashboard />;
  if (isCliente) return <ClientDashboard />;

  // Fallback for any unrecognised role
  return <DevDashboard />;
};

export default DashboardPage;
