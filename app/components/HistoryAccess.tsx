/**
 * HISTORY ACCESS CARD
 * 
 * Simple card at bottom of dashboard linking to history page
 * Shows quick stats preview
 */

interface HistoryAccessProps {
  onNavigate: () => void;
  currentStreak?: number;
  totalCheckIns?: number;
  monthlyConsistency?: number;
}

export default function HistoryAccess({
  onNavigate,
  currentStreak = 0,
  totalCheckIns = 0,
  monthlyConsistency = 0,
}: HistoryAccessProps) {
  return (
    <button
      onClick={onNavigate}
      className="w-full bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 hover:bg-slate-800/60 hover:border-blue-500/50 transition-all group relative overflow-hidden"
    >
      {/* Glow effect on hover */}
      <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📊</span>
            <h3 className="text-lg font-bold text-white">Your History</h3>
          </div>
        </div>

        {/* Quick Stats Preview */}
        <div className={`grid gap-4 ${currentStreak > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
  {currentStreak > 0 && (
    <div className="text-center">
      <p className="text-2xl font-bold text-white">{currentStreak}</p>
      <p className="text-xs text-white/50 mt-1">Current Run</p>
    </div>
  )}
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{totalCheckIns}</p>
            <p className="text-xs text-white/50 mt-1">Lifetime Check-ins</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{monthlyConsistency}%</p>
            <p className="text-xs text-white/50 mt-1">Last 30 Days</p>
          </div>
        </div>

        <p className="text-sm text-white/60 text-center mt-4 group-hover:text-white/80 transition-colors">
          Tap to view full calendar, trends, and milestones
        </p>
      </div>
    </button>
  );
}