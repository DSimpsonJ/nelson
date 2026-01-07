'use client';

import React from 'react';
import { RATINGS } from '../checkinModel';

interface RatingButtonsProps {
  selected?: string;
  onSelect: (rating: string) => void;
}

// Match onboarding color scheme exactly
const ratingColors = {
  elite: "from-green-500/20 to-green-600/10 border-green-500/40 hover:border-green-500/60",
  solid: "from-blue-500/20 to-blue-600/10 border-blue-500/40 hover:border-blue-500/60",
  not_great: "from-amber-500/20 to-amber-600/10 border-amber-500/40 hover:border-amber-500/60",
  off: "from-slate-600/20 to-slate-700/10 border-slate-500/40 hover:border-slate-500/60",
};

// Selected state colors (brighter borders)
const selectedColors = {
  elite: "border-green-500 shadow-lg shadow-green-500/30",
  solid: "border-blue-500 shadow-lg shadow-blue-500/30",
  not_great: "border-amber-500 shadow-lg shadow-amber-500/30",
  off: "border-slate-400 shadow-lg shadow-slate-400/30",
};

export function RatingButtons({ selected, onSelect }: RatingButtonsProps) {
  return (
    <div className="space-y-3">
      {RATINGS.map((rating) => {
        const colorClass = ratingColors[rating.value as keyof typeof ratingColors];
        const selectedClass = selectedColors[rating.value as keyof typeof selectedColors];
        const isSelected = selected === rating.value;
        
        return (
          <button
            key={rating.value}
            onClick={() => onSelect(rating.value)}
            className={`
              w-full bg-gradient-to-r ${colorClass} border rounded-xl p-5 text-left transition-all
              ${isSelected ? `scale-[1.02] ${selectedClass}` : ''}
            `}
          >
            <div className="flex items-center justify-between">
              <span className="text-white font-semibold text-lg">{rating.label}</span>
              {isSelected && (
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}