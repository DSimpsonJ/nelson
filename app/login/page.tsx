"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "../context/ToastContext";
import { getEmail } from "@/app/utils/getEmail";

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
      const { signInWithEmailAndPassword } = await import("firebase/auth");
      const { auth } = await import("@/app/firebase/config");
      const { db } = await import("../firebase/config");
      const { doc, getDoc } = await import("firebase/firestore");

      // ✅ Firebase authentication
      await signInWithEmailAndPassword(auth, email, password);

      // ✅ Load user profile from Firestore
      const snap = await getDoc(doc(db, "users", email));
      if (!snap.exists()) throw new Error("Missing Firestore profile.");

      localStorage.setItem("nelsonUser", JSON.stringify({ email }));

      showToast({
        message: "Welcome back!", 
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

  return (
    <div className="flex flex-col items-center p-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-bold mb-4">Welcome Back</h1>

      <input
  type="email"
  placeholder="Email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  className="border p-2 rounded w-full mb-3"
  required
  autoCapitalize="none"
  autoCorrect="off"
  spellCheck={false}
/>

      <input
        type="password"
        placeholder="Password"
        className="border p-2 rounded w-full mb-4"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button
        disabled={loading}
        onClick={handleLogin}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-semibold"
      >
        {loading ? "Loading..." : "Login"}
      </button>

      <p className="mt-4 text-sm text-gray-600">
        Need an account?{" "}
        <a href="/signup" className="text-blue-600 underline">Sign up</a>
      </p>
    </div>
  );
}