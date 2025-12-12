'use client';

import React from 'react';
import { RATINGS } from '../checkinModel';

interface RatingButtonsProps {
  selected?: string;
  onSelect: (rating: string) => void;
}

export function RatingButtons({ selected, onSelect }: RatingButtonsProps) {
  return (
    <div className="space-y-3">
      {RATINGS.map((rating) => (
        <button
          key={rating.value}
          onClick={() => onSelect(rating.value)}
          className={`w-full p-4 rounded-xl border-2 transition-all ${
            selected === rating.value
              ? 'border-blue-500 bg-blue-500/20 text-white'
              : 'border-slate-700 bg-slate-800/40 text-white/80 hover:border-blue-400 hover:bg-slate-800/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="text-left">
              <p className="font-semibold text-lg">{rating.label}</p>
              <p className="text-sm text-white/60 mt-1">{rating.description}</p>
            </div>
            {selected === rating.value && (
              <div className="text-blue-400">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}