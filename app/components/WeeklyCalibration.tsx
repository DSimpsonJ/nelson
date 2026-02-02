/**
 * WEEKLY CALIBRATION COMPONENT
 * 
 * 4 strategic questions shown after coaching delivery.
 * User trains their AI by answering once per week.
 * 
 * Design: Minimal, fast, no polish until data flow is validated
 */

'use client';

import { useState } from 'react';
import { CALIBRATION_QUESTIONS, ForceLevel, DragSource, StructuralState, GoalAlignment } from '@/app/services/weeklyCalibration';

interface WeeklyCalibrationProps {
  weekId: string;
  onComplete: (answers: {
    forceLevel: ForceLevel;
    dragSource: DragSource;
    structuralState: StructuralState;
    goalAlignment: GoalAlignment;
  }) => void;
  onSkip?: () => void;
}

export function WeeklyCalibrationFlow({ weekId, onComplete, onSkip }: WeeklyCalibrationProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<{
    forceLevel?: ForceLevel;
    dragSource?: DragSource;
    structuralState?: StructuralState;
    goalAlignment?: GoalAlignment;
  }>({});

  const questions = [
    { key: 'forceLevel', config: CALIBRATION_QUESTIONS.force },
    { key: 'dragSource', config: CALIBRATION_QUESTIONS.drag },
    { key: 'structuralState', config: CALIBRATION_QUESTIONS.structure },
    { key: 'goalAlignment', config: CALIBRATION_QUESTIONS.goal }
  ];

  const currentQuestion = questions[currentStep];

  const handleAnswer = (value: string) => {
    const newAnswers = { ...answers, [currentQuestion.key]: value };
    setAnswers(newAnswers);

    if (currentStep < questions.length - 1) {
      // Move to next question
      setCurrentStep(currentStep + 1);
    } else {
      // All done
      onComplete(newAnswers as Required<typeof answers>);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">
            Before you go, help Nelson understand this week better
          </h2>
          {onSkip && (
            <button
              onClick={onSkip}
              className="text-sm text-white/40 hover:text-white/60 transition-colors"
            >
              Skip for now
            </button>
          )}
        </div>
        
        {/* Progress indicator */}
        <div className="flex gap-2">
          {questions.map((_, idx) => (
            <div
              key={idx}
              className={`h-1 flex-1 rounded-full transition-colors ${
                idx <= currentStep 
                  ? 'bg-blue-500' 
                  : 'bg-slate-700'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Question */}
      <div className="mb-6">
        <p className="text-lg text-white mb-6">
          {currentQuestion.config.text}
        </p>

        {/* Options */}
        <div className="space-y-3">
          {currentQuestion.config.options.map((option) => (
            <button
              key={option.value}
              onClick={() => handleAnswer(option.value)}
              className="w-full px-6 py-4 bg-slate-800/40 hover:bg-slate-700/40 border border-slate-700/50 rounded-lg text-left transition-colors"
            >
              <span className="text-white">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      {currentStep > 0 && (
        <button
          onClick={handleBack}
          className="text-sm text-white/60 hover:text-white transition-colors"
        >
          ← Back
        </button>
      )}
    </div>
  );
}

/**
 * Wrapper component that handles save logic
 */
interface WeeklyCalibrationContainerProps {
  email: string;
  weekId: string;
  onComplete: () => void;
  onSkip?: () => void;
}

export function WeeklyCalibrationContainer({ 
  email, 
  weekId, 
  onComplete,
  onSkip 
}: WeeklyCalibrationContainerProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleComplete = async (answers: {
    forceLevel: ForceLevel;
    dragSource: DragSource;
    structuralState: StructuralState;
    goalAlignment: GoalAlignment;
  }) => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/save-weekly-calibration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          weekId,
          answers
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save calibration');
      }

      onComplete();
    } catch (err) {
      console.error('Error saving calibration:', err);
      setError('Failed to save. Please try again.');
      setSaving(false);
    }
  };

  if (saving) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <div className="text-white/60">Saving...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-4">
          <p className="text-red-300">{error}</p>
        </div>
        <button
          onClick={() => setError(null)}
          className="text-white/60 hover:text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <WeeklyCalibrationFlow
      weekId={weekId}
      onComplete={handleComplete}
      onSkip={onSkip}
    />
  );
}