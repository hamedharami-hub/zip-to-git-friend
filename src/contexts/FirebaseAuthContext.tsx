/**
 * Firebase Auth context — parallel to the existing Supabase auth.
 * Signup creates a Firestore profile doc at `users/{uid}`.
 * Settings sync mirrors the current AppSettings into `users/{uid}/data/settings`.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase";
import { useSettingsStore } from "@/store/settingsStore";

interface FirebaseAuthState {
  user: User | null;
  loading: boolean;
  ready: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncSettingsUp: () => Promise<void>;
  syncSettingsDown: () => Promise<void>;
}

const Ctx = createContext<FirebaseAuthState>({
  user: null,
  loading: true,
  ready: false,
  signUp: async () => {},
  signIn: async () => {},
  signOut: async () => {},
  syncSettingsUp: async () => {},
  syncSettingsDown: async () => {},
});

async function writeSettings(uid: string) {
  const { db } = await getFirebase();
  const settings = useSettingsStore.getState().settings;
  await setDoc(
    doc(db, "users", uid, "data", "settings"),
    { settings, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

async function readSettings(uid: string) {
  const { db } = await getFirebase();
  const snap = await getDoc(doc(db, "users", uid, "data", "settings"));
  if (!snap.exists()) return;
  const cloud = (snap.data()?.settings ?? {}) as Record<string, unknown>;
  const local = useSettingsStore.getState().settings;
  // Prefer cloud values that are set, otherwise keep local.
  const merged = { ...local } as Record<string, unknown>;
  for (const [k, v] of Object.entries(cloud)) {
    if (v !== undefined && v !== null && v !== "") merged[k] = v;
  }
  await useSettingsStore.getState().update(merged);
}

export function FirebaseAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let unsub = () => {};
    getFirebase()
      .then(({ auth }) => {
        setReady(true);
        unsub = onAuthStateChanged(auth, (u) => {
          setUser(u);
          setLoading(false);
          // Pull settings once on sign-in.
          if (u) readSettings(u.uid).catch((e) => console.warn("[firebase] settings pull", e));
        });
      })
      .catch((e) => {
        console.warn("[firebase] init failed", e);
        setLoading(false);
      });
    return () => unsub();
  }, []);

  // Auto-push settings to Firestore when they change (debounced).
  useEffect(() => {
    if (!user) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsub = useSettingsStore.subscribe(() => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        writeSettings(user.uid).catch((e) => console.warn("[firebase] settings push", e));
      }, 1200);
    });
    return () => {
      unsub();
      if (t) clearTimeout(t);
    };
  }, [user]);

  const value: FirebaseAuthState = {
    user,
    loading,
    ready,
    signUp: async (email, password, displayName) => {
      const { auth, db } = await getFirebase();
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        try {
          await updateProfile(cred.user, { displayName });
        } catch {
          /* non-fatal */
        }
      }
      await setDoc(
        doc(db, "users", cred.user.uid),
        {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: displayName ?? cred.user.displayName ?? null,
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
      // Seed settings doc immediately so the user has cloud state.
      await writeSettings(cred.user.uid);
    },
    signIn: async (email, password) => {
      const { auth } = await getFirebase();
      await signInWithEmailAndPassword(auth, email, password);
    },
    signOut: async () => {
      const { auth } = await getFirebase();
      await fbSignOut(auth);
    },
    syncSettingsUp: async () => {
      if (user) await writeSettings(user.uid);
    },
    syncSettingsDown: async () => {
      if (user) await readSettings(user.uid);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- non-component exports (variants/hooks/contexts)
export const useFirebaseAuth = () => useContext(Ctx);
