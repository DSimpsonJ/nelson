"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useToast } from "../context/ToastContext";
export default function SignupPage() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    birthDate: "",
    experience: "",
    goal: "",
    frequency: "",
  });

  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // simple validation
    const emptyField = Object.entries(formData).find(([_, v]) => !v);
    if (emptyField) {
      const fieldName = emptyField[0];
      alert(`Please complete the ${fieldName} field before continuing.`);
      return;
    }

    setIsSaving(true);

    try {
      // lazy import to avoid SSR issues
      const { doc, setDoc } = await import("firebase/firestore");
      const { db } = await import("../firebase/config");
    
      // use email as document id for now
      await setDoc(doc(db, "users", formData.email), {
        ...formData,
        frequency: formData.frequency,
      });
    
      // Save locally so dashboard knows which user to load
      localStorage.setItem("nelsonUser", JSON.stringify({ email: formData.email }));
    
      // ✅ Success toast appears here
      showToast("Welcome to Nelson!", "success");
    
      // redirect after short delay
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1000);
    
    } catch (err) {
      console.error("Error saving user:", err);
    
      // ❌ Error toast appears here
      showToast("Something went wrong saving your profile.", "error");
    
      setIsSaving(false);
    }
  };
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
      <div className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">
          Welcome to Nelson
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Perseverance. Patience. Progress.
        </p>

        <div className="relative">
          {isSaving && (
            <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 rounded-2xl z-10">
              <p className="text-lg font-semibold text-gray-700 animate-pulse">
                Saving your profile...
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6 mt-2">
            {/* Names */}
            <div className="flex gap-3">
              <input
                type="text"
                name="firstName"
                placeholder="First name"
                value={formData.firstName}
                onChange={handleChange}
                className="w-1/2 border border-gray-300 rounded-lg p-2 text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-blue-500"
                required
              />
              <input
                type="text"
                name="lastName"
                placeholder="Last name"
                value={formData.lastName}
                onChange={handleChange}
                className="w-1/2 border border-gray-300 rounded-lg p-2 text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* Email */}
            <input
              type="email"
              name="email"
              placeholder="Email address"
              value={formData.email}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg p-2 text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-blue-500"
              required
            />

            {/* Birthdate */}
            <label className="block text-gray-600 text-sm font-medium mt-2">
              Birthdate
            </label>
            <input
              type="date"
              name="birthDate"
              value={formData.birthDate}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg p-2 text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-blue-500"
              required
            />

            {/* Experience */}
            <label className="block text-gray-600 text-sm font-medium mt-2">
              How dialed in are you?
            </label>
            <select
              name="experience"
              value={formData.experience}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg p-2 text-gray-800 bg-white focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select experience</option>
              <option value="beginner">I’m clueless</option>
              <option value="intermediate">I’ve done a few reps in my day</option>
              <option value="advanced">This app should be asking me for tips</option>
            </select>

          {/* Goal */}
<label className="block text-gray-600 text-sm font-medium mt-2">
  What’s your primary focus?
</label>
<select
  name="goal"
  value={formData.goal}
  onChange={handleChange}
  className="w-full border border-gray-300 rounded-lg p-2 text-gray-800 bg-white focus:ring-2 focus:ring-blue-500"
  required
>
  <option value="">Select goal</option>
  <option value="muscle">Build my muscles</option>
  <option value="strength">Increase my strength</option>
  <option value="recomp">Rebuild and lean out</option>
</select>

{/* ✅ NEW: Frequency */}
<label className="block text-gray-600 text-sm font-medium mt-2">
  How many days a week will you train?
</label>
<select
  name="frequency"
  value={formData.frequency}
  onChange={handleChange}
  className="w-full border border-gray-300 rounded-lg p-2 text-gray-800 bg-white focus:ring-2 focus:ring-blue-500"
  required
>
  <option value="">Choose frequency</option>
  <option value="2">2 days per week</option>
  <option value="3">3 days per week</option>
  <option value="4">4 days per week</option>
  <option value="5">5 days per week</option>
  <option value="6">6 days per week</option>
</select>

{/* Submit */}
<button
  type="submit"
  className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition"
>
  Let’s Go
</button>
          </form>
        </div>
      </div>
    </main>
  );
}