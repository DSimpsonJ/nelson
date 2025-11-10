import { useToast } from "../context/ToastContext";

export async function withFirestoreError<T>(
  promise: Promise<T>,
  context: string,
  showToast: ReturnType<typeof useToast>["showToast"]
): Promise<T | null> {
  try {
    return await promise;
  } catch (err) {
    console.error(`[Firestore] ${context}:`, err);
    showToast({ message: `Error loading ${context}.`, type: "error" });
    return null;
  }
}