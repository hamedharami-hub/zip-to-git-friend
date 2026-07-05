import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";

// Firebase web apiKey is a publishable identifier (not a secret) and is safe in client code.
// We still read it from an env var so it can be rotated without a code change.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY as string,
  authDomain: "surface-bf3d4.firebaseapp.com",
  projectId: "surface-bf3d4",
  storageBucket: "surface-bf3d4.firebasestorage.app",
  messagingSenderId: "26876617992",
  appId: "1:26876617992:web:ca1a9df539fa35bae4f8bd",
  measurementId: "G-0F4LSKV5H0",
};

export const firebaseApp = initializeApp(firebaseConfig);

export let firebaseAnalytics: Analytics | null = null;
if (typeof window !== "undefined") {
  isSupported()
    .then((ok) => {
      if (ok) firebaseAnalytics = getAnalytics(firebaseApp);
    })
    .catch(() => {
      /* analytics unsupported (SSR / privacy mode) — ignore */
    });
}
