import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFirebaseApiKey } from "./firebaseConfig.functions";

const baseConfig = {
  authDomain: "surface-bf3d4.firebaseapp.com",
  projectId: "surface-bf3d4",
  storageBucket: "surface-bf3d4.firebasestorage.app",
  messagingSenderId: "26876617992",
  appId: "1:26876617992:web:ca1a9df539fa35bae4f8bd",
  measurementId: "G-0F4LSKV5H0",
};

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let servicesPromise: Promise<FirebaseServices> | null = null;
export let firebaseAnalytics: Analytics | null = null;

export function getFirebase(): Promise<FirebaseServices> {
  if (!servicesPromise) {
    servicesPromise = getFirebaseApiKey().then(({ apiKey }) => {
      const app = initializeApp({ ...baseConfig, apiKey });
      const auth = getAuth(app);
      const db = getFirestore(app);
      if (typeof window !== "undefined") {
        isSupported()
          .then((ok) => {
            if (ok) firebaseAnalytics = getAnalytics(app);
          })
          .catch(() => undefined);
      }
      return { app, auth, db };
    });
  }
  return servicesPromise;
}

// Back-compat alias.
export function getFirebaseApp(): Promise<FirebaseApp> {
  return getFirebase().then((s) => s.app);
}
