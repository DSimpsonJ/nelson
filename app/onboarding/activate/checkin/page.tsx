"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { getEmail } from "@/app/utils/getEmail";
import { getLocalDate } from "@/app/utils/date";
import { motion, AnimatePresence } from "framer-motion";
import { writeDailyMomentum } from "@/app/services/writeDailyMomentum";

type Rating = "elite" | "solid" | "not-great" | "off";

interface CheckInData {
  nutritionPattern: Rating | null;
  energyBalance: Rating | null;
  protein: Rating | null;
  hydration: Rating | null;
  sleep: Rating | null;
  mindset: Rating | null;
  bonusMovement: Rating | null;
}

const ratingColors = {
  elite: "from-green-500/20 to-green-600/10 border-green-500/40 hover:border-green-500/60",
  solid: "from-blue-500/20 to-blue-600/10 border-blue-500/40 hover:border-blue-500/60",
  "not-great": "from-amber-500/20 to-amber-600/10 border-amber-500/40 hover:border-amber-500/60",
  off: "from-slate-600/20 to-slate-700/10 border-slate-500/40 hover:border-slate-500/60",
};
function getRatingGrade(rating: Rating | null): number {
    switch (rating) {
      case "elite": return 100;
      case "solid": return 80;
      case "not-great": return 50;
      case "off": return 0;
      default: return 0;
    }
  }
export default function CheckInPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [checkInData, setCheckInData] = useState<CheckInData>({
    nutritionPattern: null,
    energyBalance: null,
    protein: null,
    hydration: null,
    sleep: null,
    mindset: null,
    bonusMovement: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [proteinRange, setProteinRange] = useState("140-220g");
  
  useEffect(() => {
    const loadProteinRange = async () => {
      const email = getEmail();
      if (!email) return;
  
      try {
        const userDoc = await getDoc(doc(db, "users", email));
        if (userDoc.exists()) {
          const data = userDoc.data();
          const weight = data.weight || 170;
          const cappedWeight = Math.min(weight, 240);
          const proteinMin = Math.round(cappedWeight * 0.6);
          const proteinMax = Math.round(cappedWeight * 1.0);
          setProteinRange(`${proteinMin}-${proteinMax}g`);
        }
      } catch (err) {
        console.error("Error loading protein range:", err);
      }
    };
  
    loadProteinRange();
  }, []);

  // Categories array moved inside component to access proteinRange
  const categories = [
    {
      id: "nutritionPattern" as keyof CheckInData,
      title: "Nutrition Pattern (Quality)",
      description: "This measures the quality of what you ate. How structured and intentional were your food choices?",
      examples: {
        elite: "All whole foods. Every meal was planned and clean. No processed foods, no convenience eating, no deviation.",
        solid: "Mostly whole foods and intentional choices throughout the day. No fast food or junk. Quality stayed consistent, even with some flexibility.",
        notGreat: "Mix of whole foods and processed convenience items. Quality wasn't the priority.",
        off: "Fast food, heavy snacking, desserts, or unstructured eating. Health wasn’t part of the decision-making.",
      },
    },
    {
      id: "energyBalance" as keyof CheckInData,
      title: "Energy Balance (Quantity)",
      description: "This measures how much you ate. Were your portions aligned with your goals?",
      examples: {
        elite: "Portions precisely aligned with your goals. You ate with intention and stopped at the right point. No extremes.",
        solid: "Ate appropriately for your goals. Maybe slightly over or under, but nothing extreme. Portions stayed reasonable.",
        notGreat: "Noticeably overate or underate. Portions didn't match what you intended.",
        off: "Way off target in either direction. Portions were unstructured or reactive, not aligned with your goals.",
      },
    },
    {
      id: "protein" as keyof CheckInData,
      title: "Protein Intake",
      description: `Your target range is based on your body weight (${proteinRange}). Did you pay attention to protein yesterday?`,
      examples: {
        elite: "Protein was a clear priority. You intentionally hit the upper end of your target range and knew you were there.",
        solid: "Included protein at every meal and stayed within your target range. You were confident you got enough.",
        notGreat: "Got some protein, but it wasn’t a priority and you likely missed your target range.",
        off: "Didn't think about protein at all. No attention to the target.",
      },
    },
    {
      id: "hydration" as keyof CheckInData,
      title: "Hydration",
      description: "Hydration isn’t just volume. It’s what you drank and why.",
      examples: {
        elite: "Stayed hydrated all day with intentional beverage choices. 64+ oz primarily from water. No soda, alcohol, or unnecessary liquid calories.",
        solid: "Stayed hydrated and supported health. Mostly water. Minimal caloric beverages that did not drive intake.",
        notGreat: "Got fluids, but beverage choices worked against hydration or goals. Significant reliance on caloric drinks or inconsistent water intake.",
        off: "Hydration was neglected or counterproductive. Little water, heavy alcohol or sugary drinks, signs of dehydration.",
      },
    },
    {
        id: "sleep" as keyof CheckInData,
        title: "Sleep",
        description: "Did your choices support good sleep?",
        examples: {
          elite: "Consistent bedtime/wake time (±30 min), 7+ hours of sleep opportunity, intentional wind-down routine. Woke feeling fully restored.",
          solid: "Mostly consistent schedule, 7+ hours of sleep opportunity, some wind-down routine. Woke feeling pretty good.",
          notGreat: "Inconsistent schedule OR under 7 hours of opportunity. Woke feeling tired.",
          off: "Random schedule, inadequate sleep opportunity, no routine. Woke feeling wrecked.",
        },
      },
    {
      id: "mindset" as keyof CheckInData,
      title: "Mental State",
      description: "How much mental capacity did you have yesterday?",
      examples: {
        elite: "Clear, focused, and mentally strong. High energy, optimistic, good emotional regulation.",
        solid: "Good and steady. Normal energy and mental clarity. It was a good day.",
        notGreat: "Distracted, irritable, or running on low energy. You white-knuckled your way through it.",
        off: "Mentally taxed or overwhelmed. It was a tough day and capacity was low.",
      },
    },
    {
        id: "bonusMovement" as keyof CheckInData,
        title: "Bonus Movement",
        description: "Outside of exercise, did you intentionally add extra movement yesterday?",
        examples: {
          elite: "You looked for movement opportunities all day and took them. Stairs, extra walking, active errands.",
          solid: "You added one or two intentional movement opportunities beyond your normal routine.",
          notGreat: "You moved through the day as usual, but didn’t intentionally add extra movement.",
          off: "Movement stayed minimal and you didn’t add anything beyond what was required.",
        },
      },
  ];

  const currentCategory = categories[currentStep];
  const progress = ((currentStep + 1) / categories.length) * 100;

  const handleRating = async (rating: Rating) => {
    const updatedData = {
      ...checkInData,
      [currentCategory.id]: rating,
    };
    setCheckInData(updatedData);

    // If this is the last step, submit
    if (currentStep === categories.length - 1) {
      setSubmitting(true);
      await submitCheckIn(updatedData);
    } else {
      // Move to next step
      setCurrentStep(currentStep + 1);
    }
  };

  const submitCheckIn = async (data: CheckInData) => {
    try {
      const email = getEmail();
      if (!email) {
        router.replace("/");
        return;
      }
  
      const today = getLocalDate();
  
      // Get user profile for goal
      const userSnap = await getDoc(doc(db, "users", email));
      const userData = userSnap.exists() ? userSnap.data() : null;
      const goal = userData?.goal || "fat_loss"; // Default to fat_loss if not set
  
      // Get plan for movement commitment
      const planSnap = await getDoc(doc(db, "users", email, "profile", "plan"));
      const plan = planSnap.exists() ? planSnap.data() : null;
      
      const movementMinutes = plan?.movementCommitment || 10;
      
      console.log("User goal:", goal);
      console.log("Movement minutes:", movementMinutes);
  
      // Create currentFocus object with guaranteed values
      const currentFocus = {
        habitKey: `movement_${movementMinutes}min`,
        habit: `Move ${movementMinutes} minutes daily`,
      };
      
      console.log("CurrentFocus created:", currentFocus);
  
      // Verify habitKey is a string
      if (typeof currentFocus.habitKey !== 'string') {
        console.error("habitKey is not a string:", currentFocus.habitKey);
        throw new Error("Invalid habitKey type");
      }
  
     // Convert ratings to behavior grades
const behaviorGrades = [
    { name: "Nutrition Pattern", grade: getRatingGrade(data.nutritionPattern) },
    { name: "Energy Balance", grade: getRatingGrade(data.energyBalance) },
    { name: "Protein", grade: getRatingGrade(data.protein) },
    { name: "Hydration", grade: getRatingGrade(data.hydration) },
    { name: "Sleep", grade: getRatingGrade(data.sleep) },
    { name: "Mindset", grade: getRatingGrade(data.mindset) },
    // Skip movement on first check-in (no commitment yet)
  ];
  
  console.log("Behavior grades:", behaviorGrades);
  
  // Use the momentum engine
  await writeDailyMomentum({
    email,
    date: today,
    behaviorGrades, // ← New parameter
    currentFocus,
    habitStack: [],
    goal,
    accountAgeDays: 1,
  });
  
  // Mark user as activated AND set firstCheckInAt
await setDoc(
  doc(db, "users", email),
  {
    isActivated: true,
    lastCheckInDate: today,
    // Only set firstCheckInAt if it doesn't exist
    ...(userData && !userData.firstCheckInAt && {
      firstCheckInAt: new Date().toISOString()
    })
  },
  { merge: true }
);
  
// ===== NEW: Create metadata doc with firstCheckInDate =====
await setDoc(
  doc(db, "users", email, "metadata", "accountInfo"),
  {
    firstCheckinDate: today,
    createdAt: new Date().toISOString(),
  },
  { merge: true }
);
  // ==========================================================
  
      // Redirect to celebration
      router.push("/onboarding/activate/celebration");
    } catch (err) {
      console.error("Error submitting check-in:", err);
      console.error("Full error details:", JSON.stringify(err, null, 2));
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center px-6 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <span className="text-white/60 text-sm">First Check-In</span>
            <span className="text-white/60 text-sm">
              {currentStep + 1} / {categories.length}
            </span>
          </div>
          <div className="bg-slate-700/50 h-2 rounded-full overflow-hidden">
            <motion.div
              className="bg-amber-500 h-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {/* Category title */}
            <h1 className="text-3xl font-bold text-white mb-3 text-center">
              {currentCategory.title}
            </h1>

            <p className="text-white/70 text-center mb-8">
              {currentCategory.description}
            </p>

            {/* Rating options */}
            <div className="space-y-3 mb-8">
              <button
                onClick={() => handleRating("elite")}
                disabled={submitting}
                className={`w-full bg-gradient-to-r ${ratingColors.elite} border rounded-xl p-5 text-left transition-all disabled:opacity-50`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-semibold text-lg">Elite</span>
                  <span className="text-lg">✓✓</span>
                </div>
                <p className="text-white/60 text-sm">
                  {currentCategory.examples.elite}
                </p>
              </button>

              <button
                onClick={() => handleRating("solid")}
                disabled={submitting}
                className={`w-full bg-gradient-to-r ${ratingColors.solid} border rounded-xl p-5 text-left transition-all disabled:opacity-50`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-semibold text-lg">Solid</span>
                  <span className="text-2xl">🎯</span>
                </div>
                <p className="text-white/60 text-sm">
                  {currentCategory.examples.solid}
                </p>
              </button>

              <button
                onClick={() => handleRating("not-great")}
                disabled={submitting}
                className={`w-full bg-gradient-to-r ${ratingColors["not-great"]} border rounded-xl p-5 text-left transition-all disabled:opacity-50`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-semibold text-lg">Not Great</span>
                  <span className="text-2xl">😐</span>
                </div>
                <p className="text-white/60 text-sm">
                  {currentCategory.examples.notGreat}
                </p>
              </button>

              <button
                onClick={() => handleRating("off")}
                disabled={submitting}
                className={`w-full bg-gradient-to-r ${ratingColors.off} border rounded-xl p-5 text-left transition-all disabled:opacity-50`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-semibold text-lg">Off</span>
                  <span className="text-2xl">🔍</span>
                </div>
                <p className="text-white/60 text-sm">
                  {currentCategory.examples.off}
                </p>
              </button>
            </div>

            {submitting && (
              <p className="text-white/60 text-center text-sm">
                Saving your check-in...
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}