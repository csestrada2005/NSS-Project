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

    // Safety valve
    const safetyTimer = setTimeout(() => {
      if (mountedRef.current) setLoading(false);
    }, 10000);

    const initAuth = async () => {
      try {
        // getSession espera de forma segura a que se refresque el token si es necesario
        // lo que evita el falso negativo (redirección a /login) en la nueva pestaña.
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session?.user) {
          const p = await fetchProfile(session.user.id);
          if (!mountedRef.current) return;
          setUser(session.user);

          if (p && !p.role && !p.pending_role) {
            // Wait and retry once for cases where the trigger is still running
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const retried = await fetchProfile(session.user.id);
            if (!mountedRef.current) return;
            if (retried) {
              setProfile(retried);
            } else {
              setProfile(p);
            }
          } else if (p) {
            setProfile(p);
          }

          updateLastSeen(session.user.id).catch(console.error);
        }
      } catch (err) {
        console.error("Error al obtener la sesión inicial:", err);
        // Si la sesión local está corrupta tras un deploy en Render, la cerramos forzosamente
        // para evitar el loop infinito de carga y devolverte limpiamente al login.
        await supabase.auth.signOut().catch(console.error);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    initAuth();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Ignoramos INITIAL_SESSION porque ya lo manejamos robustamente en initAuth
        if (event === "INITIAL_SESSION") return;

        try {
          const currentUser = session?.user ?? null;
          if (currentUser) {
            if (!mountedRef.current) return;
            setUser(currentUser);

            const p = await fetchProfile(currentUser.id);
            if (!mountedRef.current) return;

            // SOLUCIÓN CLAVE: Si p es null (por un fallo transitorio al
            // refrescar el token entre pestañas), NO sobreescribimos el perfil existente.
            // Esto elimina el error de "Account Being Configured".
            if (p) {
              if (p.role) writeProfileCache(p);
              setProfile(p);
            }

            if (event === "SIGNED_IN") {
              updateLastSeen(currentUser.id).catch(console.error);
            }
          } else {
            if (!mountedRef.current) return;
            setUser(null);
            setProfile(null);
          }
        } catch (err) {
          console.error("Error en el cambio de estado de auth:", err);
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
