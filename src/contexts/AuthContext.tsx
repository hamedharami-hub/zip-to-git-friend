import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useBookStore } from "@/store/bookStore";
import { useSettingsStore } from "@/store/settingsStore";

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

  // Supabase is the only auth backend. `sbUser` is derived from the session so
  // the two can never disagree.
  const user = sbUser;

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
  };

  const loading = sbLoading;

  return (
    <AuthCtx.Provider value={{ user, session, loading, signOut }}>{children}</AuthCtx.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components -- non-component exports (variants/hooks/contexts)
export const useAuth = () => useContext(AuthCtx);
