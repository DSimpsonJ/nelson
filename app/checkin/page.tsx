'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth } from 'firebase/auth';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckinShell } from './components/CheckinShell';
import { CheckinQuestion } from './components/CheckinQuestion';
import { ProgressIndicator } from './components/ProgressIndicator';
import CheckinSuccessAnimation from '@/app/components/rewards/CheckinSuccessAnimation';
import { BEHAVIORS, answersToGrades } from './checkinModel';
import { CheckinAnswers } from './types';
import { writeDailyMomentum } from '../services/writeDailyMomentum';

// Helper to get current user email
function getEmail(): string | null {
  const auth = getAuth();
  return auth.currentUser?.email || null;
}

export default function CheckinPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<CheckinAnswers>>({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false); // Guard against rapid clicks

  const currentBehavior = BEHAVIORS[currentStep];
  const isLastStep = currentStep === BEHAVIORS.length - 1;

  // Swipe animation variants (slide left on exit, slide in from right)
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
    // Prevent rapid clicks/double-taps
    if (isAdvancing) return;
    
    setIsAdvancing(true);

    const newAnswers = {
      ...answers,
      [currentBehavior.id]: rating,
    } as Partial<CheckinAnswers>;
    
    setAnswers(newAnswers);

    // Delay to let user see their selection before advancing
    setTimeout(() => {
      if (isLastStep) {
        handleSubmit(newAnswers as CheckinAnswers);
      } else {
        setCurrentStep(currentStep + 1);
        setIsAdvancing(false);
      }
    }, 600); // Increased from 300ms for better visual feedback
  };

  const handleBack = () => {
    if (currentStep > 0 && !isAdvancing) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async (finalAnswers: CheckinAnswers) => {
    // Prevent double submission
    if (submitting) return;
    
    setSubmitting(true);

    try {
      const email = getEmail();
      if (!email) {
        throw new Error('No email found');
      }

      const today = new Date().toLocaleDateString("en-CA");
      
      // Convert ratings to grades (ratings are canonical, grades are derived)
      const behaviorGrades = BEHAVIORS.map((behavior, index) => ({
        name: behavior.id,
        grade: answersToGrades(finalAnswers)[index]
      }));

      // TODO: Get actual currentFocus, habitStack, and accountAgeDays from context
      // For now, using placeholder values
      const currentFocus = {
        habitKey: 'movement_10min',
        habit: 'Move 10 minutes daily'
      };
      
      const habitStack: Array<{ habitKey: string; habit: string }> = [];
      
      const accountAgeDays = 1; // TODO: Calculate from user creation date

      // Call single writer service
      await writeDailyMomentum({
        email,
        date: today,
        behaviorGrades,
        behaviorRatings: finalAnswers,
        currentFocus,
        habitStack,
        accountAgeDays,
      });

      // Show success animation
      setShowSuccess(true);

    } catch (error) {
      console.error('Check-in submission failed:', error);
      setSubmitting(false);
      setIsAdvancing(false);
      // TODO: Show error toast to user
    }
  };

  const handleSuccessComplete = () => {
    // Route back to dashboard with flag for animation
    router.push('/dashboard?checkin=done');
  };

  if (showSuccess) {
    return (
      <CheckinShell>
        <CheckinSuccessAnimation onComplete={handleSuccessComplete} />
      </CheckinShell>
    );
  }

  return (
    <CheckinShell>
      {/* Back Button - Absolute positioned at top-left */}
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
        total={BEHAVIORS.length} 
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
          <CheckinQuestion
            title={currentBehavior.title}
            prompt={currentBehavior.prompt}
            tooltip={currentBehavior.tooltip}
            icon={currentBehavior.icon}
            selected={answers[currentBehavior.id]}
            onSelect={handleSelect}
          />
        </motion.div>
      </AnimatePresence>
    </CheckinShell>
  );
}