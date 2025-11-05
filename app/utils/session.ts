// utils/session.ts
import { db } from "../firebase/config";
import { collection, doc, setDoc, getDocs } from "firebase/firestore";

export interface Session {
  date: string;           // ISO string, e.g. "2025-11-04"
  startedAt: string;      // ISO timestamp
  endedAt?: string;       // ISO timestamp
  completedSets?: number;
  durationSec?: number;
  notes?: string;
}

export async function saveSession(email: string, session: Session) {
  const ref = doc(collection(db, "users", email, "sessions"), session.date);
  await setDoc(ref, session, { merge: true });
}

export async function getSessions(email: string): Promise<Session[]> {
  const col = collection(db, "users", email, "sessions");
  const snaps = await getDocs(col);
  return snaps.docs.map((d) => d.data() as Session);
}
export async function endSession(
    email: string,
    date: string,
    completedSets: number
  ) {
    const ref = doc(db, "users", email, "sessions", date);
    const endTime = new Date().toISOString();
  
    const snap = await getDocs(collection(db, "users", email, "sessions"));
    const current = snap.docs.find((d) => d.id === date)?.data() as Session;
  
    const durationSec = current?.startedAt
      ? Math.floor((Date.now() - new Date(current.startedAt).getTime()) / 1000)
      : 0;
  
    await setDoc(
      ref,
      { endedAt: endTime, completedSets, durationSec },
      { merge: true }
    );
  }