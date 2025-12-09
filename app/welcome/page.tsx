"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getEmail } from "@/app/utils/getEmail";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";

export default function WelcomePage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("there");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUserName = async () => {
      try {
        const email = getEmail();
        if (!email) {
          router.replace("/signup");
          return;
        }

        const userRef = doc(db, "users", email);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const userData = userSnap.data();
          setFirstName(userData.firstName || "there");
        }

        setLoading(false);
      } catch (err) {
        console.error("Failed to load user name:", err);
        setLoading(false);
      }
    };

    loadUserName();
  }, [router]);

  const handleContinue = () => {
    router.push("/intake");
  };

  if (loading) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </main>
    );
  }

  return (
    <main className="flex items-center justify-center min-h-screen bg-gray-50 px-6">
      <div className="max-w-lg w-full bg-white p-8 rounded-xl shadow-md text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Welcome, {firstName}
        </h1>
        
        <p className="text-lg text-gray-700 mb-4">
          I'm Nelson, your health accountability coach.
        </p>
        
        <p className="text-base text-gray-600 mb-8">
          Together, we'll help you build simple, sustainable habits, gain consistency, 
          and transform your identity one day at a time.
        </p>
        
        <p className="text-base text-gray-600 mb-8">
          This takes 2 minutes a day.
        </p>

        <button
          onClick={handleContinue}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
        >
          Continue
        </button>
      </div>
    </main>
  );
}