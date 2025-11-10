"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useToast } from "../context/ToastContext";
import TrainingPlan from "../components/TrainingPlan";
const labelForGoal = (g?: string) => {
  if (g === "muscle") return "Muscle Building";
  if (g === "strength") return "Strength";
  if (g === "recomp") return "Recomp";
  return "Set your goal";
};

const labelForExperience = (e?: string) => {
  if (e === "beginner") return "Beginner";
  if (e === "intermediate") return "Intermediate";
  if (e === "advanced") return "Advanced";
  return "Unknown";
};
export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [updatedUser, setUpdatedUser] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" | null }>({
    message: "",
    type: null,
  });
  const { showToast  } = useToast();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const storedUser = localStorage.getItem("nelsonUser");
        if (!storedUser) {
          window.location.href = "/signup";
          return;
        }

        const { email } = JSON.parse(storedUser);
        const userRef = doc(db, "users", email);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          setUser(userSnap.data());
          setUpdatedUser(userSnap.data());
        }
      } catch (error) {
        console.error("Error loading user:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setUpdatedUser({ ...updatedUser, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const storedUser = localStorage.getItem("nelsonUser");
      if (!storedUser) return;
      const { email } = JSON.parse(storedUser);
  
      const userRef = doc(db, "users", email);
      await updateDoc(userRef, updatedUser);
  
      setUser(updatedUser);
      setEditing(false);
  
      // ✅ Success toast here
      showToast("✅ Profile updated successfully!", "success");
  
    } catch (error) {
      console.error("Error updating user:", error);
  
      // ❌ Error toast here
      showToast("❌ Something went wrong while saving.", "error");
  
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600 text-lg animate-pulse">Loading your dashboard...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600 text-lg">
          No user found. Please <a href="/signup" className="text-blue-600 underline">sign up again</a>.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center p-6 relative">
      {toast.type && (
        <div
          className={`
            absolute top-4 right-4 px-4 py-2 rounded-lg shadow-lg animate-fade-in-out
            ${toast.type === "success" ? "bg-green-500" : ""}
            ${toast.type === "error" ? "bg-red-500" : ""}
            ${toast.type === "info" ? "bg-blue-500" : ""}
            text-white
          `}
        >
          {toast.message}
        </div>
      )}

      <div className="w-full max-w-4xl">
        {/* Header */}
        <header className="flex justify-between items-center bg-white shadow p-6 rounded-2xl mb-8">
          <h1 className="text-2xl font-bold text-gray-800">
            Welcome back, {user.firstName} {user.lastName}
          </h1>
          <button
            onClick={() => setEditing(!editing)}
            className="text-sm text-blue-600 hover:text-blue-700 font-semibold"
          >
            {editing ? "Cancel" : "Edit Profile"}
          </button>
        </header>

{/* Edit Profile Form */}
{editing && (
  <div className="bg-white p-6 rounded-2xl shadow mb-8">
    <h2 className="text-lg font-semibold mb-4 text-gray-800">Edit your info</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <select
        name="goal"
        value={updatedUser.goal || ""}
        onChange={handleChange}
        className="border border-gray-300 rounded-lg p-2 text-gray-800 bg-white"
      >
        <option value="muscle">Build my muscles</option>
        <option value="strength">Increase my strength</option>
        <option value="recomp">Rebuild and lean out</option>
      </select>
      <select
        name="experience"
        value={updatedUser.experience || ""}
        onChange={handleChange}
        className="border border-gray-300 rounded-lg p-2 text-gray-800 bg-white"
      >
        <option value="beginner">I’m clueless</option>
        <option value="intermediate">I’ve done a few reps in my day</option>
        <option value="advanced">This app should be asking me for tips</option>
      </select>
    </div>
    <button
      onClick={handleSave}
      className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg"
      disabled={saving}
    >
      {saving ? "Saving..." : "Save Changes"}
    </button>
  </div>
)}

{/* Your Progress Path */}
<section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
  <div className="bg-white p-6 rounded-2xl shadow">
    <h2 className="text-gray-600 text-sm uppercase mb-2">Your Progress Path</h2>
    <p className="text-xl font-semibold text-gray-800">
      {user.frequency ? `${user.frequency} days weekly` : "Set frequency"} — {labelForGoal(user.goal)}
    </p>
    <p className="text-sm text-gray-500 mt-1">Patience • Perseverance • Progress</p>
  </div>

  <div className="bg-white p-6 rounded-2xl shadow">
    <h2 className="text-gray-600 text-sm uppercase mb-2">Experience</h2>
    <p className="text-xl font-semibold text-gray-800">
      {labelForExperience(user.experience)}
    </p>
  </div>

  <div className="bg-white p-6 rounded-2xl shadow">
    <h2 className="text-gray-600 text-sm uppercase mb-2">Current Focus</h2>
    <p className="text-xl font-semibold text-gray-800">
      {labelForGoal(user.goal)}
    </p>
  </div>
</section>

        {/* Training Plan */}
        <TrainingPlan
  goal={user.goal}
  experience={user.experience}
  frequency={user.frequency}
/>
      </div>
    </main>
  );
}