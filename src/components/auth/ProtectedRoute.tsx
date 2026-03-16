import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const [canRedirect, setCanRedirect] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setCanRedirect(true), 600)
    return () => clearTimeout(t)
  }, [])

  if (loading || !canRedirect) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-gray-900 text-white">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
