'use client';
import React, { useState } from 'react';

interface InfoTooltipProps {
  text: string;
}

function formatTooltipText(text: string) {
  const parts = text.split(/(\bElite\b|\bSolid\b|\bNot Great\b|\bOff\b)/g);
  return parts.map((part, index) => {
    if (['Elite', 'Solid', 'Not Great', 'Off'].includes(part)) {
      return (
        <strong key={index} className="font-bold text-white">
          {part}
        </strong>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export function InfoTooltip({ text }: InfoTooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="text-white/40 transition-colors ml-2"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {show && (
        <div className="fixed inset-0 z-20 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setShow(false)}
          />
          <div className="relative w-full max-w-md max-h-[80vh] overflow-y-auto p-4 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white/80 shadow-xl">
            {formatTooltipText(text)}
          </div>
        </div>
      )}
    </div>
  );
}