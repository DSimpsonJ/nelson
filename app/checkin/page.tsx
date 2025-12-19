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
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [behaviors, setBehaviors] = useState<BehaviorMetadata[]>([]);
  const [loading, setLoading] = useState(true);

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
        
        // Generate behaviors with user's weight
        const dynamicBehaviors = getBehaviors(userWeight);
        setBehaviors(dynamicBehaviors);
      } catch (error) {
        console.error('Failed to load user data:', error);
        // Fallback to default behaviors
        setBehaviors(getBehaviors());
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [router]);

  const currentBehavior = behaviors[currentStep];
  const isLastStep = currentStep === behaviors.length - 1;

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
      [currentBehavior.id]: rating,
    } as Partial<CheckinAnswers>;
    
    setAnswers(newAnswers);

    setTimeout(() => {
      if (isLastStep) {
        handleSubmit(newAnswers as CheckinAnswers);
      } else {
        setCurrentStep(currentStep + 1);
        setIsAdvancing(false);
      }
    }, 600);
  };

  const handleBack = () => {
    if (currentStep > 0 && !isAdvancing) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async (finalAnswers: CheckinAnswers) => {
    if (submitting) return;
    
    setSubmitting(true);
  
    try {
      const email = getEmail();
      if (!email) {
        throw new Error('No email found');
      }
  
      const today = new Date().toLocaleDateString("en-CA");
      
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
  
      // TODO: Get actual currentFocus and habitStack from Firebase
      // For now using placeholder values until user context is implemented
      const currentFocus = {
        habitKey: 'movement_10min',
        habit: 'Move 10 minutes daily'
      };
      const habitStack: Array<{ habitKey: string; habit: string }> = [];
  
      await writeDailyMomentum({
        email,
        date: today,
        behaviorGrades,
        behaviorRatings: finalAnswers,
        currentFocus,
        habitStack,
        accountAgeDays,
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

  // Show loading state while fetching user data
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
        total={behaviors.length} 
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