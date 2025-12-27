import React from 'react';
import { NelsonLogoAnimated } from '@/app/components/logos/NelsonLogoAnimated';

export default function Loading() {
  return (
    <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-sm flex items-center justify-center z-50">
      <NelsonLogoAnimated />
    </div>
  );
}