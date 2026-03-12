import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { SupabaseService } from "@/services/SupabaseService";
import type { Profile } from "@/types";

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
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
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        const p = await fetchProfile(session.user.id);
        setProfile(p);
      }
      setLoading(false);
    };

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          const p = await fetchProfile(currentUser.id);
          setProfile(p);
          if (event === "SIGNED_IN") {
            await updateLastSeen(currentUser.id);
          }
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
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
