'use client';

import React from 'react';
import { RatingButtons } from './RatingButtons';
import { InfoTooltip } from './InfoTooltip';

interface CheckinQuestionProps {
  title: string;
  prompt: string;
  tooltip?: string;
  icon?: string;
  selected?: string;
  onSelect: (rating: string) => void;
}

export function CheckinQuestion({ 
  title, 
  prompt, 
  tooltip, 
  icon, 
  selected, 
  onSelect 
}: CheckinQuestionProps) {
  return (
    <div className="bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
      <div className="mb-8">
        <div className="flex items-center mb-3">
          <h2 className="text-2xl font-bold text-white">{title}</h2>
          {tooltip && <InfoTooltip text={tooltip} />}
        </div>
        <p className="text-white/70 text-lg">{prompt}</p>
      </div>
      
      <RatingButtons selected={selected} onSelect={onSelect} />
    </div>
  );
}