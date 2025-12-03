"use client";

export default function RingPulse({ text }: { text: string }) {
  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 pointer-events-auto">
      <div className="bg-blue-50 border-2 border-blue-600 px-4 py-2 rounded-lg animate-pulse">
        <p className="text-sm font-semibold text-blue-900">{text}</p>
      </div>
    </div>
  );
}