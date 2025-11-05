"use client";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import TrainingPlan from "@/app/components/TrainingPlan";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";

export default function WorkoutDayPage() {
  const router = useRouter();
  const params = useParams();
  const day = params.day as string;

  const [userData, setUserData] = useState<any>(null);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("nelsonUser") || "null");
    if (!stored?.email) {
      router.replace("/login");
      return;
    }

    const loadUser = async () => {
      const ref = doc(db, "users", stored.email);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        router.replace("/signup");
        return;
      }

      setUserData(snap.data());
    };

    loadUser();
  }, [router]);

  if (!userData) {
    return <div className="p-6 text-center">Loading workout...</div>;
  }

  return (
    <TrainingPlan
      goal={userData.goal}
      experience={userData.experience}
      frequency={userData.frequency}
    />
  );
}