'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckinShell } from './components/CheckinShell';
import { CheckinQuestion } from './components/CheckinQuestion';
import { ProgressIndicator } from './components/ProgressIndicator';
import CheckinSuccessAnimation from '@/app/components/rewards/CheckinSuccessAnimation';
import { getBehaviors, answersToGrades } from './checkinModel';
import { CheckinAnswers, BehaviorMetadata } from './types';
import { writeDailyMomentum } from '../../services/writeDailyMomentum';
import { detectAndHandleMissedCheckIns } from '../../services/missedCheckIns';
import { checkForUnresolvedGap, resolveGap } from "@/app/services/gapReconciliation";

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
  const [note, setNote] = useState("");
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = back
  const [gapReconciliation, setGapReconciliation] = useState<{
    needsReconciliation: boolean;
    gapDate?: string;
    gapMomentum?: number;
  } | null>(null);
  const [showGapQuestion, setShowGapQuestion] = useState(false);

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
        
        // NEW: Check for unresolved gap
        const today = new Date().toLocaleDateString("en-CA");
        const gapCheck = await checkForUnresolvedGap(email, today);
        setGapReconciliation(gapCheck);
        
        if (gapCheck.needsReconciliation) {
          setShowGapQuestion(true);
        }
        
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

  const isOnExerciseQuestion = currentStep === 0;
  const isOnNoteScreen = currentStep === behaviors.length + 1;
  const currentBehavior = !isOnExerciseQuestion && !isOnNoteScreen ? behaviors[currentStep - 1] : null;
  const totalSteps = behaviors.length + 2;

  // Swipe animation variants
  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 400 : -400,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? -400 : 400,
      opacity: 0,
    }),
  };

  const handleSelect = (rating: string) => {
    if (isAdvancing) return;
    
    setIsAdvancing(true);
    setDirection(1); // Add this
  
    const newAnswers = {
      ...answers,
      [currentBehavior!.id]: rating,
    } as Partial<CheckinAnswers>;
    
    setAnswers(newAnswers);
  
    setTimeout(() => {
      setCurrentStep(currentStep + 1);
      setIsAdvancing(false);
    }, 600);
  };

  const handleExerciseSelect = (completed: boolean) => {
    if (isAdvancing) return;
    
    setIsAdvancing(true);
    setDirection(1); // Add this
    setExerciseCompleted(completed);
  
    setTimeout(() => {
      setCurrentStep(1);
      setIsAdvancing(false);
    }, 600);
  };

  const handleBack = () => {
    if (currentStep > 0 && !isAdvancing) {
      setDirection(-1);
      setCurrentStep(currentStep - 1);
    }
  };

  // Swipe handler - swipe right to go back
  const handleDragEnd = (event: any, info: any) => {
    if (info.offset.x > 50 || info.velocity.x > 300) {
      handleBack();
    }
  };

  const handleSubmit = async (finalAnswers: CheckinAnswers, exerciseDeclared: boolean, noteText?: string) => {
    if (submitting) return;
    
    setSubmitting(true);
  
    try {
      const email = getEmail();
      if (!email) {
        throw new Error('No email found');
      }
  
      const today = new Date().toLocaleDateString("en-CA");
      
      const gapInfo = await detectAndHandleMissedCheckIns(email);
      console.log("[GAP DEBUG]", gapInfo);
      if (gapInfo.hadGap) {
        console.log(`[CheckIn] Gap detected: ${gapInfo.daysMissed} days - filled with gap-fill docs`);
        console.log(`[CheckIn] Last check-in was ${gapInfo.lastCheckInDate}, frozen momentum: ${gapInfo.frozenMomentum}%`);
      }
      
      const behaviorGrades = behaviors.map((behavior) => ({
        name: behavior.id,
        grade: answersToGrades(finalAnswers)[behaviors.indexOf(behavior)]
      }));
  
      const metadataRef = doc(db, 'users', email, 'metadata', 'accountInfo');
      const metadataSnap = await getDoc(metadataRef);
      const firstCheckinDate = metadataSnap.exists() 
        ? metadataSnap.data().firstCheckinDate 
        : today;
  
      const firstDate = new Date(firstCheckinDate);
      const currentDate = new Date(today);
      const diffTime = currentDate.getTime() - firstDate.getTime();
      const accountAgeDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  
      const focusRef = doc(db, 'users', email, 'momentum', 'currentFocus');
      const focusSnap = await getDoc(focusRef);
      const currentFocus = focusSnap.exists() 
        ? { habitKey: focusSnap.data().habitKey, habit: focusSnap.data().habit }
        : { habitKey: 'movement_10min', habit: 'Move 10 minutes daily' };
      
      console.log('[CheckIn] Submitting with note:', noteText);

      const { doc: momentumDoc, reward } = await writeDailyMomentum({
        email,
        date: today,
        behaviorGrades,
        behaviorRatings: finalAnswers,
        currentFocus,
        accountAgeDays,
        exerciseDeclared,
        note: noteText?.trim() || undefined,
      });
      
      sessionStorage.setItem('pendingReward', JSON.stringify(reward));
  
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
  
  const handleGapAnswer = async (exerciseCompleted: boolean) => {
    if (!gapReconciliation?.gapDate) return;
    
    setSubmitting(true);
    
    try {
      const email = getEmail();
      if (!email) throw new Error('No email found');
      
      await resolveGap(email, gapReconciliation.gapDate, exerciseCompleted);
      
      // Close gap question and proceed to normal check-in
      setShowGapQuestion(false);
      setSubmitting(false);
      
    } catch (error) {
      console.error('Gap resolution failed:', error);
      setSubmitting(false);
    }
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
  
  // NEW: Gap reconciliation screen
  if (showGapQuestion && gapReconciliation?.needsReconciliation) {
    const gapDate = gapReconciliation.gapDate;
    const formattedDate = gapDate ? new Date(gapDate + "T00:00:00").toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'short', 
      day: 'numeric' 
    }) : '';
    
    return (
      <CheckinShell>
        <div className="flex flex-col items-center justify-center min-h-screen px-6">
          <div className="text-center max-w-md">
            <h2 className="text-2xl font-bold text-white mb-3">
              You missed {formattedDate}'s check-in.
            </h2>
            <p className="text-white/60 text-sm mb-8">
              Did you complete your {targetMinutes} minute exercise commitment that day?
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => handleGapAnswer(true)}
                disabled={submitting}
                className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
              >
                Yes, I exercised
              </button>
              <button
                onClick={() => handleGapAnswer(false)}
                disabled={submitting}
                className="px-8 py-4 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
              >
                No, I didn't
              </button>
            </div>
            <p className="text-white/40 text-xs mt-6">
              This only affects whether momentum decays. Your consecutive run of check-ins restarts today.
            </p>
          </div>
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
      <ProgressIndicator 
        current={currentStep + 1} 
        total={totalSteps} 
      />

<AnimatePresence mode="wait" custom={direction}>
  <motion.div
    key={currentStep}
    custom={direction}
    variants={slideVariants}
    initial="enter"
    animate="center"
    exit="exit"
    transition={{
      x: { type: "spring", stiffness: 300, damping: 30 },
      opacity: { duration: 0.2 },
    }}
    drag={currentStep > 0 ? "x" : false}
    dragConstraints={{ left: 0, right: 0 }}
    dragElastic={{ left: 0, right: 0.8 }}
    dragTransition={{ bounceStiffness: 600, bounceDamping: 20 }}
    onDragEnd={(event, info) => {
      if (info.offset.x > 100 || info.velocity.x > 500) {
        setDirection(-1);
        handleBack();
      }
    }}
  >
          {isOnNoteScreen ? (
            <div className="flex flex-col items-center px-6 py-8">
              <h2 className="text-xl font-semibold text-white mb-2">
                Anything worth noting?
              </h2>
              <p className="text-white/60 text-sm mb-6 text-center">
                Optional, but helps personalize coaching.
              </p>
              
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Context, wins, challenges..."
                maxLength={500}
                className="w-full max-w-md bg-slate-800 border border-slate-600 rounded-lg p-4 text-white placeholder-white/40 focus:outline-none focus:border-blue-500 resize-none h-32"
              />
              
              <p className="text-white/40 text-xs mt-2">
                {note.length}/500
              </p>
              
              <button
                onClick={() => handleSubmit(answers as CheckinAnswers, exerciseCompleted!, note)}
                disabled={submitting}
                className="mt-6 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Complete Check-in"}
              </button>
            </div>
          ) : isOnExerciseQuestion ? (
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