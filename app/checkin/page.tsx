'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckinShell } from './components/CheckinShell';
import { CheckinQuestion } from './components/CheckinQuestion';
import { ProgressIndicator } from './components/ProgressIndicator';
import CheckinSuccessAnimation from '@/app/components/rewards/CheckinSuccessAnimation';
import { getBehaviors, answersToGrades } from './checkinModel';
import { CheckinAnswers, BehaviorMetadata } from './types';
import { writeDailyMomentum } from '../services/writeDailyMomentum';
import { detectAndHandleMissedCheckIns } from '../services/missedCheckIns';

// Helper to get current user email
function getEmail(): string | null {
  const auth = getAuth();
  return auth.currentUser?.email || null;
}

export default function CheckinPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<CheckinAnswers>>({});
  const [exerciseCompleted, setExerciseCompleted] = useState<boolean | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [behaviors, setBehaviors] = useState<BehaviorMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [habitName, setHabitName] = useState("Move 10 minutes");
  const [targetMinutes, setTargetMinutes] = useState(10);

  // Load user data and generate dynamic behaviors
  useEffect(() => {
    const loadUserData = async () => {
      const email = getEmail();
      if (!email) {
        router.replace('/login');
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', email));
        const userWeight = userDoc.exists() ? userDoc.data().weight : undefined;
        
        // Get habit name from currentFocus
        const focusRef = doc(db, 'users', email, 'momentum', 'currentFocus');
        const focusSnap = await getDoc(focusRef);
        if (focusSnap.exists()) {
          setHabitName(focusSnap.data().habit || "Move 10 minutes");
          setTargetMinutes(focusSnap.data().target || 10);
        }
        
        // Generate behaviors with user's weight
        const dynamicBehaviors = getBehaviors(userWeight);
        setBehaviors(dynamicBehaviors);
      } catch (error) {
        console.error('Failed to load user data:', error);
        // Fallback to defaults
        setBehaviors(getBehaviors());
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [router]);

  const totalSteps = behaviors.length + 1; // 1 exercise + 7 behaviors
  const isOnExerciseQuestion = currentStep === 0; // Exercise is now FIRST
  const currentBehavior = !isOnExerciseQuestion ? behaviors[currentStep - 1] : null;

  // Swipe animation variants
  const slideVariants = {
    enter: {
      x: 400,
      opacity: 0,
    },
    center: {
      x: 0,
      opacity: 1,
    },
    exit: {
      x: -400,
      opacity: 0,
    },
  };

  const handleSelect = (rating: string) => {
    if (isAdvancing) return;
    
    setIsAdvancing(true);

    const newAnswers = {
      ...answers,
      [currentBehavior!.id]: rating,
    } as Partial<CheckinAnswers>;
    
    setAnswers(newAnswers);

    setTimeout(() => {
      // Check if we just completed the last behavior (step 7)
      if (currentStep === behaviors.length) {
        handleSubmit(newAnswers as CheckinAnswers, exerciseCompleted!);
      } else {
        setCurrentStep(currentStep + 1);
        setIsAdvancing(false);
      }
    }, 600);
  };

  const handleExerciseSelect = (completed: boolean) => {
    if (isAdvancing) return;
    
    setIsAdvancing(true);
    setExerciseCompleted(completed);

    setTimeout(() => {
      // Move to first behavior question (step 1)
      setCurrentStep(1);
      setIsAdvancing(false);
    }, 600);
  };

  const handleBack = () => {
    if (currentStep > 0 && !isAdvancing) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async (finalAnswers: CheckinAnswers, exerciseDeclared: boolean) => {
    if (submitting) return;
    
    setSubmitting(true);
  
    try {
      const email = getEmail();
      if (!email) {
        throw new Error('No email found');
      }
  
      const today = new Date().toLocaleDateString("en-CA");
      
      // ===== CRITICAL: Detect and fill gaps BEFORE writing today's check-in =====
      const gapInfo = await detectAndHandleMissedCheckIns(email);
      if (gapInfo.hadGap) {
        console.log(`[CheckIn] Gap detected: ${gapInfo.daysMissed} days - filled with gap-fill docs`);
        console.log(`[CheckIn] Last check-in was ${gapInfo.lastCheckInDate}, frozen momentum: ${gapInfo.frozenMomentum}%`);
      }
      
      // Convert ratings to grades using the dynamic behaviors
      const behaviorGrades = behaviors.map((behavior) => ({
        name: behavior.id,
        grade: answersToGrades(finalAnswers)[behaviors.indexOf(behavior)]
      }));
  
      // Get firstCheckinDate from metadata to calculate accountAgeDays
      const metadataRef = doc(db, 'users', email, 'metadata', 'accountInfo');
      const metadataSnap = await getDoc(metadataRef);
      const firstCheckinDate = metadataSnap.exists() 
        ? metadataSnap.data().firstCheckinDate 
        : today;
  
      // Calculate accountAgeDays
      const firstDate = new Date(firstCheckinDate);
      const currentDate = new Date(today);
      const diffTime = currentDate.getTime() - firstDate.getTime();
      const accountAgeDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  
      // Get currentFocus and habitStack
      const focusRef = doc(db, 'users', email, 'momentum', 'currentFocus');
      const focusSnap = await getDoc(focusRef);
      const currentFocus = focusSnap.exists() 
        ? { habitKey: focusSnap.data().habitKey, habit: focusSnap.data().habit }
        : { habitKey: 'movement_10min', habit: 'Move 10 minutes daily' };
      
      const habitStack: Array<{ habitKey: string; habit: string }> = [];
  
      // Write today's check-in with exercise declaration
      await writeDailyMomentum({
        email,
        date: today,
        behaviorGrades,
        behaviorRatings: finalAnswers,
        currentFocus,
        habitStack,
        accountAgeDays,
        exerciseDeclared,
      });
  
      setShowSuccess(true);
  
    } catch (error) {
      console.error('Check-in submission failed:', error);
      setSubmitting(false);
      setIsAdvancing(false);
    }
  };

  const handleSuccessComplete = () => {
    router.push('/dashboard?checkin=done');
  };

  if (loading) {
    return (
      <CheckinShell>
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-white/60">Loading...</p>
        </div>
      </CheckinShell>
    );
  }

  if (showSuccess) {
    return (
      <CheckinShell>
        <CheckinSuccessAnimation onComplete={handleSuccessComplete} />
      </CheckinShell>
    );
  }

  return (
    <CheckinShell>
      <button
        onClick={handleBack}
        disabled={currentStep === 0 || isAdvancing}
        className={`
          absolute top-6 left-6 z-10
          flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
          transition-all duration-200
          ${currentStep === 0 || isAdvancing
            ? 'opacity-0 pointer-events-none'
            : 'text-white/70 hover:text-white hover:bg-white/10 active:scale-95'
          }
        `}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <ProgressIndicator 
        current={currentStep + 1} 
        total={totalSteps} 
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: "spring", stiffness: 200, damping: 25 },
            opacity: { duration: 0.3 },
          }}
        >
          {isOnExerciseQuestion ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
              <div className="text-center max-w-md">
                <h2 className="text-2xl font-bold text-white mb-3">
                  Did you complete your {targetMinutes} minute exercise commitment yesterday?
                </h2>
                <p className="text-white/60 text-sm mb-8">
                  This includes any form of dedicated exercise that met your target.
                </p>
                <div className="flex gap-4 justify-center">
                  <button
                    onClick={() => handleExerciseSelect(true)}
                    disabled={isAdvancing}
                    className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => handleExerciseSelect(false)}
                    disabled={isAdvancing}
                    className="px-8 py-4 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
                  >
                    No
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <CheckinQuestion
              title={currentBehavior!.title}
              prompt={currentBehavior!.prompt}
              tooltip={currentBehavior!.tooltip}
              icon={currentBehavior!.icon}
              selected={answers[currentBehavior!.id]}
              onSelect={handleSelect}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </CheckinShell>
  );
}