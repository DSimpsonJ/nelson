"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "../context/ToastContext";
import { getEmail } from "@/app/utils/getEmail";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from "@/app/firebase/config";
import { doc, getDoc } from "firebase/firestore";

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();

  // If already logged in, redirect immediately
  useEffect(() => {
    const email = getEmail();
    if (email) router.replace("/dashboard");
  }, [router]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [debugMsg, setDebugMsg] = useState("");

  const handleLogin = async () => {
    if (!email || !password) {
      showToast({
        message: "Please enter email and password.", 
        type: "error"
      });
      return;
    }
  
    setLoading(true);
  
    try {
      // Firebase authentication
      await signInWithEmailAndPassword(auth, email, password);
      console.log("✅ Signed in, current user:", auth.currentUser?.email);
  
      // Load user profile from Firestore
      const snap = await getDoc(doc(db, "users", email));
      if (!snap.exists()) throw new Error("Missing Firestore profile.");
  
      localStorage.setItem("nelsonUser", JSON.stringify({ email }));
      localStorage.setItem("lastLogin", new Date().toISOString());
      setDebugMsg(`Logged in at ${new Date().toLocaleTimeString()}`);
  
      showToast({
        message: "Welcome back", 
        type: "success"
      });
      router.replace("/dashboard");
  
    } catch (err: any) {
      console.error("Login error:", err);
  
      if (err.code === "auth/user-not-found") {
        showToast({
          message: "No account found. Please sign up.",
          type: "error"
        });
      } else if (err.code === "auth/wrong-password") {
        showToast({
          message: "Incorrect password.",
          type: "error"
        });
      } else {
        showToast({
          message: "Login failed. Try again.",
          type: "error"
        });
      }
  
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      showToast({
        message: "Please enter your email first.",
        type: "error"
      });
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      showToast({
        message: "If an account exists for this email, a reset link has been sent.",
        type: "success"
      });
    } catch (err) {
      console.error("Password reset error:", err);
      showToast({
        message: "If an account exists for this email, a reset link has been sent.",
        type: "success"
      });
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold text-white tracking-tight mb-3">
            Nelson
          </h1>
          <p className="text-xl text-blue-400 font-medium">
            Welcome Back
          </p>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-xl">
          <div className="space-y-5">
            <div>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            <div>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
              <button
                onClick={handleForgotPassword}
                className="text-blue-400 hover:text-blue-300 text-sm mt-2 transition"
              >
                Forgot password?
              </button>
            </div>

            <button
              disabled={loading}
              onClick={handleLogin}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-700 text-center">
            <p className="text-slate-300 text-sm">
              Need an account?{" "}
              <a href="/" className="text-blue-400 hover:text-blue-300 font-medium transition">
                Sign up
              </a>
            </p>
          </div>
        </div>
        {debugMsg && (
          <div className="mt-4 p-3 bg-green-900/50 text-green-200 rounded text-xs">
            {debugMsg}
          </div>
        )}
        <p className="text-center text-slate-400 text-md mt-8">
        Build momentum through consistent action.
        </p>
      </div>
    </main>
  );
}