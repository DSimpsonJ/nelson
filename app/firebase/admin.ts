import 'server-only';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  
  console.log('[Admin SDK] FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID);
  console.log('[Admin SDK] FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL);
  console.log('[Admin SDK] Private key exists:', !!privateKey);
  console.log('[Admin SDK] Private key length:', privateKey?.length);
  console.log('[Admin SDK] First 50 chars:', privateKey?.substring(0, 50));
  console.log('[Admin SDK] Contains literal \\n:', privateKey?.includes('\\n'));
  console.log('[Admin SDK] Contains real newline:', privateKey?.includes('\n'));

  const formattedKey = privateKey?.replace(/\\n/g, '\n');

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