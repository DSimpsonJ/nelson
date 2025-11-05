"use client";
import { useEffect, useState, useMemo } from "react";
import { db, auth } from "../firebase/config"; // ✅ add auth here
import { doc, setDoc, getDoc } from "firebase/firestore";
import { getEmail } from "../utils/getEmail";
import { generatePlan, type NelsonPlan } from "../utils/generatePlan";
import { TypeAnimation } from "react-type-animation";

type Question = {
  id: string;
  type: "message" | "singleChoice" | "numberInput" | "summary";
  text: string;
  next?: string;
  options?: { label: string; value: string }[];
  fields?: { name: string; label: string }[]; // for numberInput questions
  actions?: { label: string; action: string }[]; // for final buttons like “Let’s Go”
};

export default function IntakePage() {
  const [flow, setFlow] = useState<Question[]>([]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [typedText, setTypedText] = useState("");
  const [isTypingDone, setIsTypingDone] = useState(false);

// Resolve first name from several sources
async function resolveFirstName(): Promise<string> {
  try {
    // 1️⃣ localStorage from signup
    const raw = localStorage.getItem("nelsonUser");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.firstName && typeof parsed.firstName === "string") {
        console.log("✅ Name source: localStorage");
        return parsed.firstName;
      }
    }

    // 2️⃣ Firebase Auth profile
    const user = auth.currentUser;
    if (user?.displayName) {
      const first = user.displayName.split(" ")[0] || user.displayName;
      console.log("✅ Name source: auth.displayName");
      return first;
    }

    // 3️⃣ Firestore by email
    const email = getEmail();
    if (email) {
      const ref = doc(db, "users", email);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        if (data?.firstName) {
          console.log("✅ Name source: Firestore users/{email}");
          return data.firstName as string;
        }
      }
    }

    // 4️⃣ Firestore by UID
    if (auth.currentUser?.uid) {
      const uidRef = doc(db, "users", auth.currentUser.uid);
      const uidSnap = await getDoc(uidRef);
      if (uidSnap.exists()) {
        const data = uidSnap.data();
        if (data?.firstName) {
          console.log("✅ Name source: Firestore users/{uid}");
          return data.firstName as string;
        }
      }
    }
  } catch (e) {
    console.warn("Name resolution failed:", e);
  }

  console.log("⚠️ Name source: fallback");
  return "there";
}

// ✅ Load intake flow and inject user's first name
useEffect(() => {
  const loadFlowAndName = async () => {
    try {
      const res = await fetch("/data/intakeFlow.json", { cache: "no-store" });
      const data = await res.json();
      const questions = data.questions ?? data;

      const userName = await resolveFirstName();

      const personalized = questions.map((q: any) => ({
        ...q,
        text:
          typeof q.text === "string"
            ? q.text.replace(/\{\{name\}\}/g, userName)
            : q.text,
      }));

      setFlow(personalized);
      setStep(0);

      console.log("👤 Intake greeting using name:", userName);
    } catch (err) {
      console.error("❌ Error loading intake or name:", err);
    }
  };

  loadFlowAndName();
}, []);

  // ✅ ID lookup for transitions
  const indexById = useMemo(() => {
    const map: Record<string, number> = {};
    flow.forEach((q, idx) => (map[q.id.trim()] = idx));
    return map;
  }, [flow]);

  const current = flow[step];

  // ✅ Typing animation with realistic pacing
  useEffect(() => {
    if (!current?.text) return;

    let i = 0;
    setTypedText("");
    setIsTypingDone(false);

    const text = current.text;
    const typeChar = () => {
      if (i < text.length) {
        const nextChar = text[i];
        setTypedText((prev) => (prev ?? "") + nextChar);

        let delay = 55; // base speed
        if (nextChar === ",") delay += 180;
        if (nextChar === "." || nextChar === "!" || nextChar === "?") delay += 400;

        i++;
        setTimeout(typeChar, delay);
      } else {
        setIsTypingDone(true);
      }
    };

    typeChar();
    return () => {
      setTypedText("");
      setIsTypingDone(false);
    };
  }, [current?.id]);

  // ✅ Save intake + plan to Firestore
  const finalizeIntake = async () => {
    try {
      const email = getEmail();
      if (!email) return;

      const plan: NelsonPlan = generatePlan(answers);

      await setDoc(doc(db, "users", email, "profile", "intake"), {
        ...answers,
        plan,
        createdAt: new Date().toISOString(),
      });

      console.log("✅ Intake and plan saved:", plan);
    } catch (err) {
      console.error("❌ Failed to save plan:", err);
    }
  };

  // ✅ Navigation helpers
  const goToById = (id?: string) => {
    if (!id) return false;
    const idx = indexById[id.trim()];
    if (idx !== undefined && idx < flow.length) {
      setStep(idx);
      return true;
    }
    return false;
  };

  const handleNext = (id: string, value?: string) => {
    if (value !== undefined) {
      setAnswers((prev) => ({ ...prev, [id]: value }));
    }

    // Handle final step
    if (id === "complete") {
      finalizeIntake();
      return;
    }

    const currentQ = flow.find((q) => q.id === id);
    if (currentQ?.next && goToById(currentQ.next)) return;

    if (id === "welcome" && goToById("activity")) return;

    const idx = indexById[id.trim()];
    if (idx + 1 < flow.length) setStep(idx + 1);
  };

  // ✅ Render
  if (!current) {
    return (
      <main className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <h1 className="text-2xl font-semibold mb-4">You’re all set!</h1>
        <button
          onClick={finalizeIntake}
          className="bg-blue-600 text-white px-6 py-2 rounded-md"
        >
          Continue to Dashboard
        </button>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-6">
      <div className="max-w-lg w-full bg-white text-gray-900 p-6 rounded-xl shadow-md transition-all duration-300">
        <p className="text-lg font-medium mb-4 text-gray-900">
          {typedText}
          {!isTypingDone && <span className="animate-pulse">|</span>}
        </p>

        {current.id === "welcome" && isTypingDone && (
          <button
            onClick={() => handleNext("welcome")}
            className="bg-blue-600 text-white px-5 py-2 mt-3 rounded-md hover:bg-blue-700 transition-all"
          >
            Continue
          </button>
        )}

        {/* ✅ Single choice questions */}
{current.type === "singleChoice" && isTypingDone && (
  <div className="space-y-2 mt-4">
    {current.options?.map((opt: any) => (
      <button
        key={opt.value}
        onClick={() => handleNext(current.id, opt.value)}
        className="w-full py-2 border border-gray-300 rounded-md hover:bg-blue-50 text-gray-900 transition-all"
      >
        {opt.label}
      </button>
    ))}
  </div>
)}

{/* ✅ Number input questions (like weight) */}
{current.type === "numberInput" && isTypingDone && (
  <div className="mt-4 space-y-3">
    {current.fields?.map((field: any) => (
      <div key={field.name}>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {field.label}
        </label>
        <input
          type="number"
          onChange={(e) =>
            setAnswers((prev) => ({ ...prev, [field.name]: e.target.value }))
          }
          className="w-full border border-gray-300 rounded-md px-3 py-2"
        />
      </div>
    ))}
    <button
      onClick={() => handleNext(current.id)}
      className="bg-blue-600 text-white px-5 py-2 mt-3 rounded-md hover:bg-blue-700 transition-all w-full"
    >
      Continue
    </button>
  </div>
)}

{/* ✅ Final action directly on summary */}
{current.actions &&
  isTypingDone &&
  current.actions.some((a: any) => a.action === "finalizeIntake") && (
    <button
      onClick={async () => {
        await finalizeIntake();
        window.location.href = "/plan";
      }}
      className="bg-green-600 text-white px-5 py-2 mt-4 rounded-md hover:bg-green-700 transition-all w-full"
    >
      Let’s Do This!
    </button>
  )}
      </div>
    </main>
  );
}