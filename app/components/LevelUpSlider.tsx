"use client";

import { useState, useEffect } from "react";

interface LevelUpSliderProps {
  currentTarget: number;
  lastProvenTarget: number;
  direction: 'increase' | 'decrease';
  onSelect: (newTarget: number) => void;
  onBack: () => void;
}

export default function LevelUpSlider({
  currentTarget,
  lastProvenTarget,
  direction,
  onSelect,
  onBack,
}: LevelUpSliderProps) {
  
  // Determine smart anchor position
  const getAnchor = () => {
    if (direction === 'increase') {
      // Suggest small increase
      if (currentTarget < 10) return currentTarget + 2;
      return currentTarget + 5;
    } else {
      // Anchor at last proven level
      return Math.min(lastProvenTarget, currentTarget - 2);
    }
  };
  
  const anchor = getAnchor();
  
  // Slider values: 1,2,3,4,5,7,10,12,15,20,25,30,35,40,45
  const sliderValues = [1, 2, 3, 4, 5, 7, 10, 12, 15, 20, 25, 30, 35, 40, 45, 60];
  
  // Filter based on direction
  const availableValues = sliderValues.filter(val => 
    direction === 'increase' ? val > currentTarget : val < currentTarget
  );
  
  // Start at anchor if available, otherwise first valid option
  const initialValue = availableValues.includes(anchor) 
    ? anchor 
    : availableValues[0];
  
  const [selectedValue, setSelectedValue] = useState(initialValue);
  
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const index = parseInt(e.target.value);
    setSelectedValue(availableValues[index]);
  };
  
  const currentIndex = availableValues.indexOf(selectedValue);
  
  return (
    <div className="space-y-4">
      {/* Current Selection Display */}
      <div className="bg-slate-800 rounded-lg p-4 text-center">
        <div className="text-4xl font-bold text-white mb-1">
          {selectedValue}
        </div>
        <div className="text-gray-400 text-sm">
          minutes daily
        </div>
      </div>
      
      {/* Slider */}
      <div className="relative px-2">
        <input
          type="range"
          min="0"
          max={availableValues.length - 1}
          value={currentIndex}
          onChange={handleSliderChange}
          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(currentIndex / (availableValues.length - 1)) * 100}%, #475569 ${(currentIndex / (availableValues.length - 1)) * 100}%, #475569 100%)`
          }}
        />
        
        {/* Anchor indicator (yellow dot) */}
        {availableValues.includes(anchor) && (
          <div 
            className="absolute top-[-6px] w-3 h-3 bg-yellow-400 rounded-full pointer-events-none border-2 border-white"
            style={{
              left: `calc(${(availableValues.indexOf(anchor) / (availableValues.length - 1)) * 100}% + 8px - 6px)`,
            }}
          />
        )}
      </div>
      
      {/* Value labels */}
      <div className="flex justify-between text-xs text-gray-400 px-2">
        <span>{availableValues[0]} min</span>
        <span>{availableValues[Math.floor(availableValues.length / 2)]} min</span>
        <span>{availableValues[availableValues.length - 1]} min</span>
      </div>
      
      {/* Context message */}
      {selectedValue === anchor && direction === 'increase' && (
        <p className="text-yellow-400 text-xs text-center">
          ⭐ Based on last week's performance
        </p>
      )}
      
      {selectedValue === lastProvenTarget && direction === 'decrease' && (
        <p className="text-blue-400 text-xs text-center">
          💡 Last proven sustainable level
        </p>
      )}
      
      {/* Action buttons */}
      <div className="flex gap-3 mt-4">
        <button
          onClick={onBack}
          className="px-6 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 rounded-lg transition"
        >
          ← Back
        </button>
        
        <button
          onClick={() => onSelect(selectedValue)}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition"
        >
          Commit to {selectedValue} min
        </button>
      </div>
    </div>
  );
}