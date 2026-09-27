import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import NebuLoader from '../brand/NebuLoader';

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  // Keep the spinner until auth+profile are both resolved.
  // The arbitrary 1200ms canRedirect delay has been removed — it was masking
  // the real issue (loading becoming false too early) and caused black screens
  // in new tabs where loading finished before canRedirect fired.
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-background">
        <NebuLoader size={160} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
