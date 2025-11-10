"use client";
import { useState, useEffect } from "react";
import { db } from "../firebase/config";
import { doc, setDoc } from "firebase/firestore";
import { getEmail } from "../utils/getEmail";
import { TypeAnimation } from "react-type-animation";

export default function IntakePage() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [flow, setFlow] = useState<any[]>([]);

  // ✅ Dynamically load JSON
  useEffect(() => {
    const loadFlow = async () => {
      try {
        const res = await fetch("/data/intakeFlow.json");
        if (!res.ok) throw new Error("Failed to load intake flow");
        const data = await res.json();
        if (data.questions) {
          setFlow(data.questions);
        } else {
          setFlow(data);
        }
      } catch (err) {
        console.error("Failed to load intakeFlow.json:", err);
      }
    };
    loadFlow();
  }, []);

  // ✅ Handle advancing through questions
  const handleNext = (key: string, value: any) => {
    setAnswers({ ...answers, [key]: value });
    setStep(step + 1);
  };

  // ✅ Save answers to Firestore
  const saveProfile = async () => {
    const email = getEmail();
    if (!email) return;
    await setDoc(doc(db, "users", email, "profile", "intake"), answers);
  };

  const current = flow[step];

  if (!current) {
    return (
      <main className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <h1 className="text-2xl font-semibold mb-4">You’re all set!</h1>
        <button
          onClick={saveProfile}
          className="bg-blue-600 text-white px-6 py-2 rounded-md"
        >
          Continue to Dashboard
        </button>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center justify-center h-screen bg-gray-50 px-6">
      <div className="max-w-lg bg-white p-6 rounded-xl shadow-md">
      <TypeAnimation
  sequence={[current.text, 999999]}
  speed={45}
  wrapper="p"
  cursor={false}
  className="text-lg font-medium mb-4"
/>
  
        {current.type === "singleChoice" && (
          <div className="space-y-2">
            {current.options?.map((opt: any) => (
              <button
                key={opt.value}
                onClick={() => handleNext(current.id, opt.value)}
                className="w-full py-2 border rounded-md hover:bg-blue-50"
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}