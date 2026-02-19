"use client";

import { useState, useEffect } from "react";
import { useRouter, redirect } from "next/navigation";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { getEmail } from "@/app/utils/getEmail";
import { getLocalDate } from "@/app/utils/date";
import { motion, AnimatePresence } from "framer-motion";
import { writeDailyMomentum } from "@/app/services/writeDailyMomentum";
import { getAuth, onAuthStateChanged } from "firebase/auth";

type Rating = "elite" | "solid" | "not-great" | "off";

interface CheckInData {
  exercise: boolean | null;
  nutrition_quality: Rating | null;
  portion_control: Rating | null;
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
    exercise: null,
    nutrition_quality: null,
    portion_control: null,
    protein: null,
    hydration: null,
    sleep: null,
    mindset: null,
    bonusMovement: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [proteinRange, setProteinRange] = useState("140-220g");
  const [exerciseCompleted, setExerciseCompleted] = useState<boolean | null>(null);
  
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
    // Exercise question (Yes/No only)
    {
      id: "exercise" as keyof CheckInData,
      title: "Exercise Commitment",
      description: `Did you do any intentional exercise yesterday?`,
      isExercise: true,
      examples: {
        elite: "", // Not used for exercise
        solid: "",
        notGreat: "",
        off: "",
      },
    },
    {
      id: "nutrition_quality" as keyof CheckInData,
      title: "Nutrition Quality",
      description: "How nutrient rich were your food choices yesterday?",
      microcopy: "(Think overall quality, not one meal.)",
      examples: {
        elite: "All whole foods. Every meal intentional. No processed or convenience eating.",
        solid: "Mostly whole foods. Intentional choices. Some flexibility, but quality stayed high.",
        notGreat: "Mixed quality. Some whole foods, some convenience or processed items.",
        off: "Fast food, heavy snacking, desserts, or unstructured eating. Health wasn’t a factor.",
      },
    },
    {
      id: "portion_control" as keyof CheckInData,
      title: "Portion Control",
      description: "Did your intake align with your goals?",
      microcopy: "(Consider the quantity of your meals overall.)",
      examples: {
        elite: "Fully aligned with your goals. You ate with control and stopped as planned.",
        solid: "Generally aligned with your goals. Portions felt balanced.",
        notGreat: "Noticeably over or underate. Portions didn’t match your intention.",
        off: "Way off target in either direction. Unstructured and misaligned with your goals.",
      },
    },
    {
      id: "protein" as keyof CheckInData,
      title: "Protein Intake",
      description: `Your target range is ${proteinRange}. `,
      microcopy: "(How closely did you pay attention to protein yesterday?)",
      examples: {
        elite: "Protein was a clear priority. You intentionally hit the upper end of your range.",
        solid: "Included protein at every meal and stayed within your target range.",
        notGreat: "Got some protein, but likely missed your target range.",
        off: "Didn't prioritize protein. No attention to the target.",
      },
    },
    {
      id: "hydration" as keyof CheckInData,
      title: "Hydration",
      description: "Daily fluid choices.",
      microcopy: "(What you drank and why.)",
      examples: {
        elite: "Hydrated intentionally all day. 64+ oz, mostly water. No alcohol or liquid calories.",
        solid: "Stayed hydrated with mostly water. Minimal caloric drinks.",
        notGreat: "Some fluids, but inconsistent water and relied on caloric drinks.",
        off: "Little to no water. Heavy alcohol or sugary drinks. Hydration was neglected.",
      },
    },
    {
        id: "sleep" as keyof CheckInData,
        title: "Sleep",
        description: "Did your choices support good sleep?",
        microcopy: "(Schedule, duration, and wind-down.)",
        examples: {
          elite: "Consistent schedule, 7+ hours in bed, intentional wind-down. Woke fully restored.",
          solid: "Mostly consistent schedule, 7+ hours in bed. Woke feeling good.",
          notGreat: "Inconsistent schedule OR under 7 hours in bed. Woke tired.",
          off: "Late, short, or chaotic sleep. Woke exhausted.",
        },
      },
    {
      id: "mindset" as keyof CheckInData,
      title: "Mental State",
      description: "How much mental capacity did you have yesterday?",
      microcopy: "(Clarity, energy, and emotional control.)",
      examples: {
        elite: "Clear, focused, high energy. Emotionally steady and resilient.",
        solid: "Stable and capable. Normal energy and clarity. It was a good day.",
        notGreat: "Low energy, distracted, or irritable. Pushed through.",
        off: "Overwhelmed or mentally drained. Capacity was very low.",
      },
    },
    {
        id: "bonusMovement" as keyof CheckInData,
        title: "Bonus Activity",
        description: "Outside of exercise, did you add extra movement?",
        microcopy: "(Stairs, walking, parking far, active choices.)",
        examples: {
          elite: "Sought movement all day. Took every reasonable opportunity.",
          solid: "Added one or two intentional movement choices.",
          notGreat: "Moved as usual. No intentional additions.",
          off: "Minimized movement beyond what was required.",
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

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const submitCheckIn = async (data: CheckInData) => {
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      
      if (!currentUser?.email) {
        // Don't redirect - layout guard handles this
        return;
      }
      
      const email = currentUser.email;
  
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
    { name: "Nutrition Quality", grade: getRatingGrade(data.nutrition_quality) },
    { name: "Portion Control", grade: getRatingGrade(data.portion_control) },
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
    goal,
    accountAgeDays: 1,
    exerciseDeclared: exerciseCompleted!,
  });
  
  // Mark user as activated AND set firstCheckInAt
  await setDoc(
    doc(db, "users", email),
    {
      hasCommitment: true,
      lastCheckInDate: today,
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

      {/* Back button */}
      <button
        onClick={handleBack}
        disabled={currentStep === 0 || submitting}
        className={`
          absolute top-6 left-6 z-10
          ${currentStep === 0 || submitting
            ? 'opacity-0 pointer-events-none'
            : 'text-white/70 hover:text-white'
          }
          transition-opacity duration-200
        `}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

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
            <p className="text-white/70 text-center mb-1">
              {currentCategory.description}
            </p>

            {currentCategory.microcopy && (
              <p className="text-white/60 text-sm text-center mb-4 italic">
                {currentCategory.microcopy}
              </p>
            )}
            {/* Rating options */}
            {currentCategory.isExercise ? (
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => {
                    setExerciseCompleted(true);
                    const updatedData = { ...checkInData, exercise: true };
                    setCheckInData(updatedData);
                    setCurrentStep(currentStep + 1);
                  }}
                  disabled={submitting}
                  className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
                >
                  Yes
                </button>
                <button
                  onClick={() => {
                    setExerciseCompleted(false);
                    const updatedData = { ...checkInData, exercise: false };
                    setCheckInData(updatedData);
                    setCurrentStep(currentStep + 1);
                  }}
                  disabled={submitting}
                  className="px-8 py-4 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
                >
                  No
                </button>
              </div>
            ) : (
              <div className="space-y-3 mb-8">
                <button
                  onClick={() => handleRating("elite")}
                  disabled={submitting}
                  className={`w-full bg-gradient-to-r ${ratingColors.elite} border rounded-xl p-5 text-left transition-all disabled:opacity-50`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-semibold text-lg">Elite</span>
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
                  </div>
                  <p className="text-white/60 text-sm">
                    {currentCategory.examples.off}
                  </p>
                </button>
              </div>
            )}

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