'use client';

import React from 'react';

interface CheckinShellProps {
  children: React.ReactNode;
}

export function CheckinShell({ children }: CheckinShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 flex items-center justify-center">
      <div className="w-full max-w-2xl">
        {children}
      </div>
    </div>
  );
}