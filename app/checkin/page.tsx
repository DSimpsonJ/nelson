'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth } from 'firebase/auth';
import { CheckinShell } from './components/CheckinShell';
import { CheckinQuestion } from './components/CheckinQuestion';
import { ProgressIndicator } from './components/ProgressIndicator';
import { CheckinSuccess } from './components/CheckinSuccess';
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

  const handleSelect = (rating: string) => {
    // Prevent rapid clicks/double-taps
    if (isAdvancing) return;
    
    setIsAdvancing(true);

    const newAnswers = {
      ...answers,
      [currentBehavior.id]: rating,
    } as Partial<CheckinAnswers>;
    
    setAnswers(newAnswers);

    // Auto-advance after selection
    setTimeout(() => {
      if (isLastStep) {
        handleSubmit(newAnswers as CheckinAnswers);
      } else {
        setCurrentStep(currentStep + 1);
        setIsAdvancing(false);
      }
    }, 300);
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
        <CheckinSuccess onComplete={handleSuccessComplete} />
      </CheckinShell>
    );
  }

  return (
    <CheckinShell>
      <ProgressIndicator 
        current={currentStep + 1} 
        total={BEHAVIORS.length} 
      />

      <CheckinQuestion
        title={currentBehavior.title}
        prompt={currentBehavior.prompt}
        tooltip={currentBehavior.tooltip}
        icon={currentBehavior.icon}
        selected={answers[currentBehavior.id]}
        onSelect={handleSelect}
      />

      {currentStep > 0 && !isAdvancing && (
        <button
          onClick={handleBack}
          className="mt-6 text-white/60 hover:text-white text-sm transition-colors"
        >
          ← Back
        </button>
      )}
    </CheckinShell>
  );
}