import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCeLRnpUbGepbODUNtVRSAKvMHlWQYVUDg",
  authDomain: "nelson-7e349.firebaseapp.com",
  projectId: "nelson-7e349",
  storageBucket: "nelson-7e349.firebasestorage.app",
  messagingSenderId: "386584258881",
  appId: "1:386584258881:web:1326de79a76d74b14799c0"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

let persistencePromise: Promise<void> | null = null;

export function ensureAuthPersistence() {
  if (typeof window === "undefined") return Promise.resolve();

  if (!persistencePromise) {
    persistencePromise = setPersistence(auth, browserLocalPersistence);
  }
  return persistencePromise;
}