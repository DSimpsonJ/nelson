import 'server-only';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  
  if (!privateKey) {
    throw new Error('FIREBASE_PRIVATE_KEY environment variable is not set');
  }

  // Handle both formats: literal \n strings and already-formatted keys
  const formattedKey = privateKey.includes('\\n') 
    ? privateKey.replace(/\\n/g, '\n')
    : privateKey;

  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: formattedKey,
    }),
  });
}

export const adminDb = getFirestore();
export const adminAuth = getAuth();