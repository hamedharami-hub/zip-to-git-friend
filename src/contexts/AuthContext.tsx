import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useBookStore } from "@/store/bookStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useFirebaseAuth } from "./FirebaseAuthContext";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { user: fbUser, loading: fbLoading, signOut: fbSignOut } = useFirebaseAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [sbUser, setSbUser] = useState<User | null>(null);
  const [sbLoading, setSbLoading] = useState(true);

  useEffect(() => {
    try {
      const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
        setSession(s);
        setSbUser(s?.user ?? null);
        if (
          s?.user &&
          (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")
        ) {
          setTimeout(() => {
            void useBookStore.getState().syncWithCloud();
            void useSettingsStore.getState().syncWithCloud();
          }, 0);
        }
      });
      supabase.auth
        .getSession()
        .then(({ data }) => {
          setSession(data?.session ?? null);
          setSbUser(data?.session?.user ?? null);
          setSbLoading(false);
        })
        .catch(() => setSbLoading(false));
      return () => sub?.subscription?.unsubscribe();
    } catch {
      setSbLoading(false);
    }
  }, []);

  // Map Firebase user into a compatible User shape if Supabase user is absent
  const effectiveUser: User | null =
    sbUser ??
    (fbUser
      ? ({
          id: fbUser.uid,
          app_metadata: { provider: "firebase" },
          user_metadata: {
            full_name: fbUser.displayName,
            name: fbUser.displayName,
            avatar_url: fbUser.photoURL,
          },
          aud: "authenticated",
          created_at: fbUser.metadata.creationTime ?? new Date().toISOString(),
          email: fbUser.email,
          phone: fbUser.phoneNumber,
          role: "authenticated",
          updated_at: fbUser.metadata.lastSignInTime ?? new Date().toISOString(),
        } as unknown as User)
      : null);

  const signOut = async () => {
    await fbSignOut();
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
  };

  const loading = fbLoading && sbLoading;

  return (
    <AuthCtx.Provider value={{ user: effectiveUser, session, loading, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components -- non-component exports (variants/hooks/contexts)
export const useAuth = () => useContext(AuthCtx);
