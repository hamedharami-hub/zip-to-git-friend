import { type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { type Auth } from "firebase/auth";
import { type Firestore } from "firebase/firestore";
import { app, auth, db, testConnection } from "@/integrations/firebase/client";

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

export let firebaseAnalytics: Analytics | null = null;

if (typeof window !== "undefined") {
  isSupported()
    .then((ok) => {
      if (ok) firebaseAnalytics = getAnalytics(app);
    })
    .catch(() => undefined);
}

export async function getFirebase(): Promise<FirebaseServices> {
  return { app, auth, db };
}

// Back-compat alias.
export function getFirebaseApp(): Promise<FirebaseApp> {
  return Promise.resolve(app);
}

export { testConnection };
