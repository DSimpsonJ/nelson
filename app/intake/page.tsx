"use client";
import { useEffect, useState, useMemo } from "react";
import { db, auth } from "../firebase/config"; // ✅ add auth here
import { doc, setDoc, getDoc } from "firebase/firestore";
import { getEmail } from "../utils/getEmail";
import { generatePlan, type NelsonPlan } from "../utils/generatePlan";
import { TypeAnimation } from "react-type-animation";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

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
  const router = useRouter();
  const [flow, setFlow] = useState<Question[]>([]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [typedText, setTypedText] = useState("");
  const [isTypingDone, setIsTypingDone] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
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

        let delay = 24; // base speed
        if (nextChar === ",") delay += 80;
        if (nextChar === "." || nextChar === "!" || nextChar === "?") delay += 160;

        i++;
        setTimeout(typeChar, delay);
      } else {
        setIsTypingDone(true);
        setTimeout(() => setShowAnswers(true), 40);
      }
    };
    
    typeChar();
    return () => {
      setTypedText("");
      setIsTypingDone(false);
      setShowAnswers(false);     // ← THIS ONE
    };
  }, [current?.id]);
  function generatePlanFromIntake(intake: any) {
    // Basic defaults
    const plan: any = {
      goal: intake.goal || "fatloss",
      trainingDays: intake.commitment ? Number(intake.commitment) : 3,
      equipment: intake.equipment || "bodyweight",
      hydrationTarget: intake.hydration ? Number(intake.hydration) : 3,
      sleepTarget: intake.sleep ? Number(intake.sleep) : 7,
      coachingStyle: intake.coachingStyle || "encouraging",
    };
  
    // Adjust hydration target for goal type
    if (plan.goal === "muscle") plan.hydrationTarget += 0.5;
    if (plan.goal === "fatloss") plan.hydrationTarget = Math.max(plan.hydrationTarget, 3);
  
    return plan;
  }
  // ✅ Save intake + plan to Firestore
  const finalizeIntake = async () => {
    try {
      const email = getEmail();
      if (!email) return;
      console.log("📌 Saving answers:", answers);
      const plan: NelsonPlan = generatePlan(answers);

      await setDoc(doc(db, "users", email, "profile", "intake"), {
        ...answers,
        plan,
        createdAt: new Date().toISOString(),
      });

      console.log("✅ Intake and plan saved:", plan);
      router.push("/plan");
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
    // Save answer if provided
    if (value !== undefined) {
      setAnswers((prev) => ({ ...prev, [id]: value }));
    }
  
    const currentQ = flow.find((q) => q.id === id);
    if (!currentQ) return;
  
    // 🔥 If this question has a finalizeIntake action, stop navigation
    if (currentQ.actions?.some(a => a.action === "finalizeIntake")) {
      return;
    }
  
    // Continue to next ID in the JSON flow
    if (currentQ.next && goToById(currentQ.next)) return;
  
    // Special case for welcome → activity
    if (id === "welcome" && goToById("activity")) return;
  
    // Default: go to next step
    const idx = indexById[id.trim()];
    if (idx + 1 < flow.length) {
      setStep(idx + 1);
    }
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
   <div
  className="
    w-full
    max-w-md
    bg-white text-gray-900
    p-5
    rounded-xl shadow-md
    transition-all duration-300 ease-out
    min-h-[420px]
    flex flex-col justify-between
  "
>

             {/* TOP SECTION */}
      <div className="flex-1 flex flex-col">

{/* Nelson’s message */}
<p key={current?.id} className="text-lg font-medium mb-4 text-gray-900">
  {typedText}
  {!isTypingDone && <span className="animate-pulse">|</span>}
</p>

{/* Welcome screen */}
{current.id === "welcome" && isTypingDone && (
  <motion.button
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25 }}
    onClick={() => handleNext("welcome")}
    className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700 transition-all"
  >
    Continue
  </motion.button>
)}

{/* Single choice questions */}
{isTypingDone && current.type === "singleChoice" && (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25 }}
    className="space-y-2 mt-4"
  >
    {current.options?.map((opt: any) => (
      <button
        key={opt.value}
        onClick={() => handleNext(current.id, opt.value)}
        className="w-full py-2 border border-gray-300 rounded-md hover:bg-blue-50 text-gray-900 transition-all"
      >
        {opt.label}
      </button>
    ))}
  </motion.div>
)}

{/* Number input questions */}
{isTypingDone && current.type === "numberInput" && (
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

{/* Final summary action */}
{isTypingDone &&
  current.actions?.some((a: any) => a.action === "finalizeIntake") && (
    <button
      onClick={async () => {
        setIsTypingDone(false);
        setTypedText("I'm designing your plan... This usually takes just a few seconds...");
        await finalizeIntake();
        setTimeout(() => window.location.href = "/plan", 2000);
      }}
      className="bg-green-600 text-white px-5 py-2 mt-4 rounded-md hover:bg-green-700 transition-all w-full"
    >
      Let’s Do This!
    </button>
  )}
</div>

{/* BOTTOM SECTION */}
<div className="mt-4 flex justify-center">
  <p
    className="
      text-gray-400 text-center text-[11px]
      cursor-pointer
      transition-transform transition-colors duration-150 ease-out
      hover:text-gray-700 hover:scale-[1.15]
      origin-bottom
    "
    onClick={() => (window.location.href = '/intake')}
  >
    Start Over
  </p>
</div>
</div>
</main>
);
}