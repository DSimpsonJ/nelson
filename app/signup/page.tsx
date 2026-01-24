"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { setDoc, doc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase/config";

export default function SignupPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    birthday: "",
    password: "",
    confirmPassword: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      const userCred = await createUserWithEmailAndPassword(
        auth,
        form.email,
        form.password
      );
    
      // ✅ Update Firebase Auth profile
      await updateProfile(userCred.user, {
        displayName: `${form.firstName} ${form.lastName}`,
      });
    
      // ✅ Store user info in Firestore
await setDoc(doc(db, "users", form.email), {
  firstName: form.firstName,
  lastName: form.lastName,
  email: form.email,
  birthday: form.birthday,
  accountCreatedAt: serverTimestamp(),
  readLearnSlugs: [],
});
    
      // ✅ Persist user info locally so getEmail() can find it later
      localStorage.setItem(
        "nelsonUser",
        JSON.stringify({ email: form.email })
      );
    
      // ✅ Redirect to welcome screen
      router.push("/onboarding");
    } catch (err: any) {
      setError(err.message || "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex items-center justify-center min-h-screen bg-gray-50 px-6">
      <div className="max-w-md w-full bg-white p-6 rounded-xl shadow-md">
        <h1 className="text-2xl font-semibold mb-4 text-center text-gray-900">
          Create Your Account
        </h1>

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="flex space-x-3">
            <input
              name="firstName"
              placeholder="First Name"
              value={form.firstName}
              onChange={handleChange}
              required
              className="w-1/2 border border-gray-300 rounded-md px-3 py-2"
            />
            <input
              name="lastName"
              placeholder="Last Name"
              value={form.lastName}
              onChange={handleChange}
              required
              className="w-1/2 border border-gray-300 rounded-md px-3 py-2"
            />
          </div>

          <input
            name="email"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          />

          <input
            name="birthday"
            type="date"
            value={form.birthday}
            onChange={handleChange}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          />

          <input
            name="password"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={handleChange}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          />

          <input
            name="confirmPassword"
            type="password"
            placeholder="Confirm Password"
            value={form.confirmPassword}
            onChange={handleChange}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          />

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition"
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>
      </div>
    </main>
  );
}