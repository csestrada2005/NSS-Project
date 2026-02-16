import { useAuth } from './AuthProvider';
import { Loader2 } from 'lucide-react';

export const Login = () => {
  const { signInWithGoogle, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-gray-900 text-white">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen w-screen bg-gray-900 text-white gap-4">
      <h1 className="text-2xl font-bold">Welcome to Open Lovable Builder</h1>
      <p className="text-gray-400">Please sign in to continue.</p>
      <button
        onClick={() => signInWithGoogle()}
        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-md text-white font-medium transition-colors"
      >
        Sign in with Google
      </button>
    </div>
  );
};
