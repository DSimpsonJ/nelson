// app/firebase/config.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCeLRnpUbGepbODUNtVRSAKvMHlWQYVUDg",
  authDomain: "nelson-7e349.firebaseapp.com",
  projectId: "nelson-7e349",
  storageBucket: "nelson-7e349.firebasestorage.app",
  messagingSenderId: "386584258881",
  appId: "1:386584258881:web:1326de79a76d74b14799c0"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);