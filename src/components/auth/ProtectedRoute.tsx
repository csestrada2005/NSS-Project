import { useAuth } from './AuthProvider';
import { Login } from './Login';
import { Loader2 } from 'lucide-react';

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-gray-900 text-white">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (!user) {
    // Redirect to login (simulated by rendering login component)
    return <Login />;
  }

  return <>{children}</>;
};
