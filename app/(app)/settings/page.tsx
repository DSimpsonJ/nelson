"use client";

import { useState } from "react";
import { getAuth, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    localStorage.removeItem("nelsonUser");
    localStorage.removeItem("lastLogin");
    const auth = getAuth();
    await signOut(auth);
    router.push("/login");
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setError(null);

    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user?.email) throw new Error("No authenticated user");

      const token = await user.getIdToken();

      const response = await fetch("/api/delete-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: user.email }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Deletion failed");
      }

    // Sign out locally after server-side deletion
localStorage.removeItem("nelsonUser");
localStorage.removeItem("lastLogin");
await signOut(auth);
router.push("/login");

    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-semibold text-white mb-10">Settings</h1>

      {/* Account */}
      <section className="mb-10">
        <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">Account</h2>
        <div className="bg-slate-800 rounded-lg divide-y divide-slate-700">
          <button
            onClick={handleSignOut}
            className="w-full text-left px-4 py-4 text-sm text-white/80 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </section>

      {/* Legal */}
      <section className="mb-10">
        <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">Legal</h2>
        <div className="bg-slate-800 rounded-lg divide-y divide-slate-700">
          <a
            href="https://thenelson.app/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="block px-4 py-4 text-sm text-white/80 hover:text-white transition-colors"
          >
            Privacy Policy
          </a>
          <a
            href="https://thenelson.app/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="block px-4 py-4 text-sm text-white/80 hover:text-white transition-colors"
          >
            Terms of Use
          </a>
        </div>
      </section>

      {/* Support */}
      <section className="mb-10">
        <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">Support</h2>
        <div className="bg-slate-800 rounded-lg">
          <a
            href="mailto:support@thenelson.app"
            className="block px-4 py-4 text-sm text-white/80 hover:text-white transition-colors"
          >
            Contact support
          </a>
        </div>
      </section>

      {/* Danger zone */}
      <section>
        <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">Danger zone</h2>
        <div className="bg-slate-800 rounded-lg px-4 py-4">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-sm text-red-400 hover:text-red-300 transition-colors"
            >
              Delete account
            </button>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-white/70">
                This will permanently delete your account and all your data. This cannot be undone.
              </p>
              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="text-sm text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : "Yes, delete my account"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="text-sm text-white/60 hover:text-white transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}