import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { SupabaseService } from "@/services/SupabaseService";
import type { Profile } from "@/types";

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileSettled: boolean;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  isAdmin: boolean;
  isDev: boolean;
  isVendedor: boolean;
  isCliente: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  profileSettled: false,
  signOut: async () => {},
  signInWithGoogle: async () => {},
  isAdmin: false,
  isDev: false,
  isVendedor: false,
  isCliente: false,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const supabase = SupabaseService.getInstance().client;

  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (error) {
      console.error("Error fetching profile:", error);
      return null;
    }
    return data as Profile;
  };

  const updateLastSeen = async (userId: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({ last_seen: new Date().toISOString() })
      .eq("id", userId);
    if (error) console.error("Error updating last_seen:", error);
  };

  useEffect(() => {
    mountedRef.current = true;

    // Safety valve: never leave the app stuck in loading state indefinitely.
    const safetyTimer = setTimeout(() => {
      if (mountedRef.current) setLoading(false);
    }, 10000);

    // onAuthStateChange fires INITIAL_SESSION on mount (covers the init case),
    // SIGNED_IN after OAuth redirect, SIGNED_OUT after sign-out, etc.
    // We keep loading=true until BOTH user and profile (or confirmed absence)
    // are resolved inside the handler — never before.
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        try {
          const currentUser = session?.user ?? null;
          if (currentUser) {
            const p = await fetchProfile(currentUser.id);
            if (!mountedRef.current) return;
            setUser(currentUser);
            setProfile(p);
            if (event === "SIGNED_IN") {
              // Fire-and-forget; last_seen update should not block auth flow.
              updateLastSeen(currentUser.id).catch((err) =>
                console.error("Error updating last_seen:", err)
              );
            }
          } else {
            if (!mountedRef.current) return;
            setUser(null);
            setProfile(null);
          }
        } catch (err) {
          console.error("Auth state change error:", err);
          if (!mountedRef.current) return;
          setUser(session?.user ?? null);
          setProfile(null);
        } finally {
          // Only set loading=false here, after everything above has settled.
          if (mountedRef.current) setLoading(false);
        }
      }
    );

    return () => {
      mountedRef.current = false;
      clearTimeout(safetyTimer);
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    // Clear local state first to avoid any flicker on the way out.
    setUser(null);
    setProfile(null);
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({ provider: "google" });
  };

  const role = profile?.role;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        // profileSettled is kept for backward compatibility with any consumers
        // that still reference it.  It is always true once loading is false.
        profileSettled: !loading,
        signOut,
        signInWithGoogle,
        isAdmin: role === "admin",
        isDev: role === "dev",
        isVendedor: role === "vendedor",
        isCliente: role === "cliente",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
