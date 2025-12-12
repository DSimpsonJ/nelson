'use client';

import React from 'react';

interface ProgressIndicatorProps {
  current: number;
  total: number;
}

export function ProgressIndicator({ current, total }: ProgressIndicatorProps) {
  return (
    <div className="mb-8">
      <p className="text-white/60 text-sm text-center mb-4">
        Question {current} of {total}
      </p>
      <div className="flex gap-2 justify-center">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`h-2 w-2 rounded-full transition-all ${
              i < current ? 'bg-blue-500' : 'bg-white/20'
            }`}
          />
        ))}
      </div>
    </div>
  );
}