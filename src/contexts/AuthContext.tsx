import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { SupabaseService } from "@/services/SupabaseService";
import type { Profile } from "@/types";

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileSettled: boolean;
  pendingApproval: boolean;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  refreshProfile: () => Promise<void>;
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
  pendingApproval: false,
  signOut: async () => {},
  signInWithGoogle: async () => {},
  refreshProfile: async () => {},
  isAdmin: false,
  isDev: false,
  isVendedor: false,
  isCliente: false,
});

const PROFILE_CACHE_KEY = 'nebu_profile_cache';

function readProfileCache(): Pick<Profile, 'role' | 'pending_role' | 'role_approved' | 'full_name' | 'avatar_url' | 'email'> | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeProfileCache(p: Profile) {
  try {
    localStorage.setItem(
      PROFILE_CACHE_KEY,
      JSON.stringify({
        role: p.role,
        pending_role: p.pending_role,
        role_approved: p.role_approved,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        email: p.email,
      })
    );
  } catch {}
}

function clearProfileCache() {
  try {
    localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {}
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // Pre-populate profile with cached role data so the layout renders correctly
  // immediately on reload, before Supabase resolves.
  const cachedRole = readProfileCache();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(
    cachedRole ? (cachedRole as unknown as Profile) : null
  );
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
    const p = data as Profile;
    // If profile exists but has no role and no pending_role, the DB trigger
    // might still be running. Wait 500ms and retry once.
    if (p && !p.role && !p.pending_role) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const { data: retryData, error: retryError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (!retryError && retryData) {
        return retryData as Profile;
      }
    }
    if (p?.role) {
      writeProfileCache(p);
    }
    return p;
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
    let authResolved = false;

    const loadUserData = async (session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"], event: string) => {
      authResolved = true;
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        // Race fetchProfile against a 3000ms timeout to prevent database
        // cold-start hangs from blocking the UI indefinitely.
        const p = await Promise.race([
          fetchProfile(currentUser.id),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);

        if (!mountedRef.current) return;

        if (p) {
          setProfile(p);
        } else {
          // fetchProfile returned null (network error / cold-start 503).
          // Fall back to the localStorage cache so the user sees their
          // dashboard immediately rather than being stranded on SetupPage.
          const cached = readProfileCache();
          if (cached) {
            setProfile(cached as unknown as Profile);
          }
        }

        if (event === "SIGNED_IN") {
          updateLastSeen(currentUser.id).catch(console.error);
        }
      } else {
        setProfile(null);
        clearProfileCache();
      }

      if (mountedRef.current) setLoading(false);
    };

    // Set up the auth listener FIRST so no events are missed.
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        loadUserData(session, event);
      }
    );

    // Non-blocking fallback: if the listener hasn't fired yet (e.g. no session),
    // ensure loading is resolved via getSession().
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!authResolved) {
        loadUserData(session, "INITIAL_SESSION");
      }
    });

    return () => {
      mountedRef.current = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    // Clear local state first to avoid any flicker on the way out.
    clearProfileCache();
    setUser(null);
    setProfile(null);
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({ provider: "google" });
  };

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[refreshProfile] error:', error);
      return;
    }

    console.log('[refreshProfile] fetched data:', data);
    setProfile((data as Profile) || null);
  }, [user?.id]);

  const role = profile?.role;
  // pendingApproval: user has picked a role but not been approved yet
  const pendingApproval = !!(profile && !profile.role && profile.pending_role);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        // profileSettled is kept for backward compatibility with any consumers
        // that still reference it.  It is always true once loading is false.
        profileSettled: !loading,
        pendingApproval,
        signOut,
        signInWithGoogle,
        refreshProfile,
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
