import React from 'react';

interface NelsonLogoHeaderProps {
  className?: string;
}

export const NelsonLogoHeader: React.FC<NelsonLogoHeaderProps> = ({ className = "" }) => {
  return (
    <div className={`flex items-center ${className}`} style={{ gap: '0px' }}>
      <svg width="48" height="56" viewBox="0 0 72 82" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M 16 10 L 16 64" stroke="#F59E0B" strokeWidth="10" strokeLinecap="round"/>
        <path d="M 16 74 L 6 62 M 16 74 L 26 62" stroke="#F59E0B" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M 16 10 L 56 70" stroke="#F59E0B" strokeWidth="10" strokeLinecap="round"/>
        <path d="M 56 70 L 56 16" stroke="#F59E0B" strokeWidth="10" strokeLinecap="round"/>
        <path d="M 56 6 L 46 18 M 56 6 L 66 18" stroke="#F59E0B" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span className="text-2xl font-bold text-white tracking-tight" style={{ marginLeft: '-6px' }}>ELSON</span>
    </div>
  );
};