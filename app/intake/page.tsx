"use client";
import { useEffect, useState, useMemo } from "react";
import { db, auth } from "../firebase/config";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { getEmail } from "../utils/getEmail";
import { buildInitialPlanFromIntake } from "../utils/buildInitialPlanFromIntake";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

type Question = {
  id: string;
  type: "message" | "singleChoice" | "numberInput" | "summary" | "router";
  text?: string;
  next?: string;
  options?: { label: string; value: string }[];
  fields?: { name: string; label: string }[];
  actions?: { label: string; action: string }[];
  routes?: Record<string, string>;
  disclaimer?: string;
};

export default function IntakePage() {
  const router = useRouter();
  const [flow, setFlow] = useState<Question[]>([]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [showContent, setShowContent] = useState(false);

  async function resolveFirstName(): Promise<string> {
    try {
      const raw = localStorage.getItem("nelsonUser");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.firstName && typeof parsed.firstName === "string") {
          console.log("✅ Name source: localStorage");
          return parsed.firstName;
        }
      }

      const user = auth.currentUser;
      if (user?.displayName) {
        const first = user.displayName.split(" ")[0] || user.displayName;
        console.log("✅ Name source: auth.displayName");
        return first;
      }

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

  const indexById = useMemo(() => {
    const map: Record<string, number> = {};
    flow.forEach((q, idx) => (map[q.id.trim()] = idx));
    return map;
  }, [flow]);

  const current = flow[step];

  useEffect(() => {
    setShowContent(false);
    const timer = setTimeout(() => setShowContent(true), 50);
    return () => clearTimeout(timer);
  }, [step]);

  const finalizeIntake = async () => {
    try {
      const email = getEmail();
      if (!email) return;
      
      console.log("📌 Saving intake answers:", answers);
      
      const plan = buildInitialPlanFromIntake(answers as any);
      
      console.log("📌 Generated plan:", plan);

      await setDoc(doc(db, "users", email, "profile", "intake"), {
        ...answers,
        createdAt: new Date().toISOString(),
      });

      await setDoc(doc(db, "users", email, "profile", "plan"), plan);

      console.log("✅ Intake and plan saved");
      router.push("/dashboard");
    } catch (err) {
      console.error("❌ Failed to save intake:", err);
    }
  };

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
    const currentQ = flow.find((q) => q.id === id);
    if (!currentQ) return;

    if (value !== undefined) {
      setAnswers((prev) => ({ ...prev, [id]: value }));

      if (currentQ.type === "router" && currentQ.routes) {
        const activityLevel = answers.activityLevel;
        const nextId = currentQ.routes[activityLevel];
        if (nextId && goToById(nextId)) return;
      }
    }

    if (currentQ.actions?.some((a) => a.action === "finalizeIntake")) {
      return;
    }

    if (currentQ.next && goToById(currentQ.next)) return;

    if (id === "welcome" && goToById("goal")) return;

    const idx = indexById[id.trim()];
    if (idx + 1 < flow.length) {
      setStep(idx + 1);
    }
  };

  useEffect(() => {
    if (current?.type === "router" && current.routes) {
      const activityLevel = answers.activityLevel;
      if (activityLevel && current.routes[activityLevel]) {
        goToById(current.routes[activityLevel]);
      }
    }
  }, [current?.id, answers.activityLevel]);

  if (!current) {
    return (
      <main className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <h1 className="text-2xl font-semibold mb-4">You're all set!</h1>
        <button
          onClick={finalizeIntake}
          className="bg-blue-600 text-white px-6 py-2 rounded-md"
        >
          Continue to Dashboard
        </button>
      </main>
    );
  }

  if (current.type === "router") {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-6">
        <div className="text-gray-500">Loading...</div>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-6">
      <div className="w-full max-w-md bg-white text-gray-900 p-6 rounded-xl shadow-md min-h-[420px] flex flex-col justify-between">
        <div className="flex-1 flex flex-col">
          <motion.div
            key={current?.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: showContent ? 1 : 0, y: showContent ? 0 : 10 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <p className="text-lg font-medium mb-4 text-gray-900">
              {current.text}
            </p>

            {current.disclaimer && (
              <p className="text-sm text-gray-600 mb-4 italic">
                {current.disclaimer}
              </p>
            )}
          </motion.div>

          {current.id === "welcome" && showContent && (
            <motion.button
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              onClick={() => handleNext("welcome")}
              className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700 transition-all"
            >
              Continue
            </motion.button>
          )}

          {showContent && current.type === "singleChoice" && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
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

          {showContent && current.type === "numberInput" && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="mt-4 space-y-3"
            >
              {current.fields?.map((field: any) => (
                <div key={field.name}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label}
                  </label>
                  <input
                    type="number"
                    onChange={(e) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [field.name]: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
              ))}
              <button
                onClick={() => handleNext(current.id)}
                disabled={
                  current.fields?.some(
                    (field) => !answers[field.name] || answers[field.name] === ""
                  )
                }
                className="bg-blue-600 text-white px-5 py-2 mt-3 rounded-md hover:bg-blue-700 transition-all w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </motion.div>
          )}

          {showContent &&
            current.actions?.some((a: any) => a.action === "finalizeIntake") && (
              <motion.button
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                onClick={finalizeIntake}
                className="bg-green-600 text-white px-5 py-2 mt-4 rounded-md hover:bg-green-700 transition-all w-full"
              >
                Let's Go!
              </motion.button>
            )}
        </div>

        <div className="mt-4 flex justify-center">
          <p
            className="text-gray-400 text-center text-[11px] cursor-pointer transition-transform transition-colors duration-150 ease-out hover:text-gray-700 hover:scale-[1.15] origin-bottom"
            onClick={() => (window.location.href = "/intake")}
          >
            Start Over
          </p>
        </div>
      </div>
    </main>
  );
}