import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { getFirebaseApiKey } from "./firebaseConfig.functions";

const baseConfig = {
  authDomain: "surface-bf3d4.firebaseapp.com",
  projectId: "surface-bf3d4",
  storageBucket: "surface-bf3d4.firebasestorage.app",
  messagingSenderId: "26876617992",
  appId: "1:26876617992:web:ca1a9df539fa35bae4f8bd",
  measurementId: "G-0F4LSKV5H0",
};

let appPromise: Promise<FirebaseApp> | null = null;
export let firebaseAnalytics: Analytics | null = null;

export function getFirebaseApp(): Promise<FirebaseApp> {
  if (!appPromise) {
    appPromise = getFirebaseApiKey().then(({ apiKey }) => {
      const app = initializeApp({ ...baseConfig, apiKey });
      if (typeof window !== "undefined") {
        isSupported()
          .then((ok) => {
            if (ok) firebaseAnalytics = getAnalytics(app);
          })
          .catch(() => {});
      }
      return app;
    });
  }
  return appPromise;
}
