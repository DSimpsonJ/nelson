import React from 'react';

interface NelsonIconProps {
  size?: number;
}

export const NelsonIcon: React.FC<NelsonIconProps> = ({ size = 96 }) => {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="4" width="88" height="88" rx="16" fill="#1E293B"/>
      <rect x="4" y="4" width="88" height="88" rx="16" stroke="#F59E0B" strokeWidth="4"/>
      <path d="M 28 22 L 28 66" stroke="#F59E0B" strokeWidth="8" strokeLinecap="round"/>
      <path d="M 28 74 L 20 64 M 28 74 L 36 64" stroke="#F59E0B" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M 28 22 L 68 68" stroke="#F59E0B" strokeWidth="8" strokeLinecap="round"/>
      <path d="M 68 68 L 68 22" stroke="#F59E0B" strokeWidth="8" strokeLinecap="round"/>
      <path d="M 68 18 L 60 26 M 68 18 L 76 26" stroke="#F59E0B" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};