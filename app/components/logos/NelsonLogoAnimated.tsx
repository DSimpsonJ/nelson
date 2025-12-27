import React from 'react';

interface NelsonLogoAnimatedProps {
  className?: string;
}

export const NelsonLogoAnimated: React.FC<NelsonLogoAnimatedProps> = ({ className = "" }) => {
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <svg width="72" height="82" viewBox="0 0 72 82" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g>
          <animateTransform
            attributeName="transform"
            attributeType="XML"
            type="rotate"
            values="0 36 40; 0 36 40; 0 36 40; 360 36 40; 360 36 40"
            keyTimes="0; 0.7; 0.75; 0.95; 1"
            dur="1.6s" 
            repeatCount="indefinite"
          />
          
          <path 
            d="M 16 74 L 16 64 L 16 10" 
            stroke="#F59E0B" 
            strokeWidth="10" 
            strokeLinecap="round"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset="1"
          >
            <animate 
              attributeName="stroke-dashoffset" 
              values="1; 0; 0; 0; 1"
              keyTimes="0; 0.2; 0.7; 0.73; 1"
              dur="1.6s" 
              repeatCount="indefinite"
            />
          </path>
          
          <path 
            d="M 16 74 L 6 62 M 16 74 L 26 62" 
            stroke="#F59E0B" 
            strokeWidth="7" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset="1"
          >
            <animate 
              attributeName="stroke-dashoffset" 
              values="1; 1; 0; 0; 1"
              keyTimes="0; 0.05; 0.2; 0.73; 1"
              dur="1.6s" 
              repeatCount="indefinite"
            />
          </path>
          
          <path 
            d="M 16 10 L 56 70" 
            stroke="#F59E0B" 
            strokeWidth="10" 
            strokeLinecap="round"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset="1"
          >
            <animate 
              attributeName="stroke-dashoffset" 
              values="1; 1; 0; 0; 1"
              keyTimes="0; 0.2; 0.45; 0.73; 1"
              dur="1.6s" 
              repeatCount="indefinite"
            />
          </path>
          
          <path 
            d="M 56 70 L 56 16 L 56 6" 
            stroke="#F59E0B" 
            strokeWidth="10" 
            strokeLinecap="round"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset="1"
          >
            <animate 
              attributeName="stroke-dashoffset" 
              values="1; 1; 0; 0; 1"
              keyTimes="0; 0.45; 0.65; 0.73; 1"
              dur="1.6s" 
              repeatCount="indefinite"
            />
          </path>
          
          <path 
            d="M 56 6 L 46 18 M 56 6 L 66 18" 
            stroke="#F59E0B" 
            strokeWidth="7" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset="1"
          >
            <animate 
              attributeName="stroke-dashoffset" 
              values="1; 1; 0; 0; 1"
              keyTimes="0; 0.6; 0.7; 0.73; 1"
              dur="1.6s" 
              repeatCount="indefinite"
            />
          </path>
        </g>
      </svg>
    </div>
  );
};