/**
 * Weekly Coaching Dev Tool
 * 
 * Test button for generating weekly coaching using pattern fixtures.
 * Shows validation results, stores output, displays summary.
 * 
 * Usage: Add to DashboardDevTools component
 */

'use client';

import { useState } from 'react';
import { 
  PatternType, 
  GenerateWeeklyCoachingResponse,
  WeeklySummaryRecord 
} from '@/app/types/weeklyCoaching';

const PATTERN_OPTIONS: { value: PatternType; label: string }[] = [
  { value: 'building_momentum', label: '🚀 Building Momentum' },
  { value: 'momentum_plateau', label: '📊 Momentum Plateau' },
  { value: 'gap_disruption', label: '⚠️ Gap Disruption' },
  { value: 'commitment_misaligned', label: '⚡ Commitment Misaligned' },
  { value: 'recovery_deficit', label: '😴 Recovery Deficit' },
  { value: 'effort_inconsistent', label: '🔄 Effort Inconsistent' },
  { value: 'variance_high', label: '📈 Variance High' },
  { value: 'insufficient_data', label: '❓ Insufficient Data (Skip)' },
  { value: 'building_foundation', label: '🌱 Building Foundation (Skip)' }
];

interface WeeklyCoachingDevToolProps {
  userEmail: string;
}

export function WeeklyCoachingDevTool({ userEmail }: WeeklyCoachingDevToolProps) {
  const [selectedPattern, setSelectedPattern] = useState<PatternType>('building_momentum');
  const [useRealData, setUseRealData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateWeeklyCoachingResponse | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/generate-weekly-coaching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          weekId: '2026-W04',
          useFixture: useRealData ? undefined : selectedPattern
        })
      });

      const data: GenerateWeeklyCoachingResponse = await response.json();
      setResult(data);

    } catch (error) {
      console.error('Error generating coaching:', error);
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-slate-700 bg-slate-800/50 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-100">
          🤖 Weekly Coaching Generator
        </h3>
        <span className="text-xs text-slate-400">Phase 2A Testing</span>
      </div>

      {/* Data Source Toggle */}
      <div className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg border border-slate-600">
        <button
          onClick={() => setUseRealData(false)}
          className={`flex-1 px-3 py-2 rounded transition-colors font-medium text-sm ${
            !useRealData 
              ? 'bg-blue-600 text-white' 
              : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
          }`}
        >
          📋 Use Fixtures
        </button>
        <button
          onClick={() => setUseRealData(true)}
          className={`flex-1 px-3 py-2 rounded transition-colors font-medium text-sm ${
            useRealData 
              ? 'bg-emerald-600 text-white' 
              : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
          }`}
        >
          🔴 Use Real Data
        </button>
      </div>

      {useRealData ? (
        <div className="bg-emerald-900/20 border border-emerald-700 rounded-lg p-3">
          <div className="text-sm font-medium text-emerald-300 mb-1">
            Real Data Mode
          </div>
          <div className="text-xs text-emerald-400">
            Will detect your actual pattern from check-ins and read your notes
          </div>
        </div>
      ) : (
        <>
          {/* Pattern Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200">
              Select Pattern to Test:
            </label>
            <select
              value={selectedPattern}
              onChange={(e) => setSelectedPattern(e.target.value as PatternType)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={loading}
            >
              {PATTERN_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
      >
        {loading ? 'Generating...' : 'Generate Coaching'}
      </button>

      {/* Results */}
      {result && (
        <div className="space-y-3">
          {/* Success/Error Status */}
          <div className={`px-3 py-2 rounded-lg ${
            result.success 
              ? 'bg-emerald-900/30 border border-emerald-700' 
              : 'bg-red-900/30 border border-red-700'
          }`}>
            <div className="flex items-center gap-2">
              <span className="text-lg">
                {result.success ? '✅' : '❌'}
              </span>
              <span className="font-medium text-slate-100">
                {result.success ? 'Success' : 'Failed'}
              </span>
            </div>
          </div>

          {/* Error Details */}
          {!result.success && result.error && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
              <p className="text-sm font-medium text-red-400 mb-1">Error:</p>
              <p className="text-sm text-red-300">{result.error}</p>
              
              {result.validationErrors && result.validationErrors.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-medium text-red-400">Validation Errors:</p>
                  {result.validationErrors.map((err, idx) => (
                    <div key={idx} className="text-xs text-red-300 pl-2">
                      • [{err.rule}] {err.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Summary Record */}
          {result.success && result.summary && (
            <SummaryDisplay summary={result.summary} />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SUMMARY DISPLAY COMPONENT
// ============================================================================

function SummaryDisplay({ summary }: { summary: WeeklySummaryRecord }) {
  return (
    <div className="bg-slate-900/50 border border-slate-600 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
        <div className="text-sm font-medium text-slate-300">
  {formatWeekId(summary.weekId)}
</div>
          <div className="text-xs text-slate-400">
            Pattern: {summary.patternType}
          </div>
        </div>
        <div className={`px-2 py-1 rounded text-xs font-medium ${
          summary.status === 'generated' 
            ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-700'
            : summary.status === 'skipped'
            ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-700'
            : 'bg-red-900/30 text-red-400 border border-red-700'
        }`}>
          {summary.status.toUpperCase()}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-slate-400">Check-ins</div>
          <div className="text-slate-200 font-medium">
            {summary.realCheckInsThisWeek}/{summary.daysAnalyzed}
          </div>
        </div>
        <div>
          <div className="text-slate-400">Lifetime</div>
          <div className="text-slate-200 font-medium">
            {summary.totalLifetimeCheckIns}
          </div>
        </div>
        <div>
          <div className="text-slate-400">Model</div>
          <div className="text-slate-200 font-medium">
            {summary.modelVersion === 'none' ? 'N/A' : 'Sonnet 4'}
          </div>
        </div>
      </div>

      {/* Evidence Points */}
      <div>
        <div className="text-xs font-medium text-slate-300 mb-1">Evidence:</div>
        <div className="space-y-1">
          {summary.evidencePoints.map((point, idx) => (
            <div key={idx} className="text-xs text-slate-400 pl-2">
              • {point}
            </div>
          ))}
        </div>
      </div>

      {/* Coaching Output (if generated) */}
      {summary.status === 'generated' && summary.coaching && (
        <div className="space-y-2 pt-2 border-t border-slate-700">
          <CoachingSection 
  title="Pattern" 
  content={summary.coaching.pattern}
  emoji="👋"
/>
<CoachingSection 
  title="Tension" 
  content={summary.coaching.tension}
  emoji="👁️"
/>
<CoachingSection 
  title="Why This Matters" 
  content={summary.coaching.whyThisMatters}
  emoji="💡"
/>
        </div>
      )}

      {/* Skip Reason (if skipped) */}
      {summary.status === 'skipped' && summary.skipReason && (
        <div className="bg-yellow-900/20 border border-yellow-800 rounded p-2">
          <div className="text-xs font-medium text-yellow-300 mb-1">
            Skip Reason:
          </div>
          <div className="text-xs text-slate-300">
            {summary.skipReason === 'insufficient_data' 
              ? 'Not enough check-ins this week (< 4 days)'
              : 'Still in baseline period (< 10 lifetime check-ins)'}
          </div>
        </div>
      )}

      {/* Rejection Details (if rejected) */}
      {summary.status === 'rejected' && (
        <div className="bg-red-900/20 border border-red-800 rounded p-2">
          <div className="text-xs font-medium text-red-300 mb-1">
            Rejection Reason:
          </div>
          <div className="text-xs text-red-300 mb-2">
            {summary.rejectionReason}
          </div>
          {summary.rawOutput && (
            <details className="text-xs">
              <summary className="cursor-pointer text-red-400 hover:text-red-300">
                View raw output
              </summary>
              <pre className="mt-2 p-2 bg-slate-950 rounded text-xs text-slate-300 overflow-x-auto">
                {summary.rawOutput}
              </pre>
            </details>
          )}
        </div>
      )}
       {/* Weekly Focus - Always at top */}
    {summary.coaching && summary.coaching.progression && (
      <div className="bg-blue-900/30 border-2 border-blue-600 rounded-lg p-3 mb-3">
        <div className="text-xs font-semibold text-blue-300 mb-1 uppercase tracking-wide">
          🎯 Weekly Focus • {summary.coaching.progression.type}
        </div>
        <div className="text-base font-semibold text-white leading-snug">
          {summary.coaching.progression.text}
        </div>
      </div>
    )}
    </div>
  );
}
function formatWeekId(weekId: string): string {
  // Parse "2026-W04" to "Week of Jan 19-25"
  const [year, week] = weekId.split('-W').map(Number);
  const jan1 = new Date(year, 0, 1);
  const weekStart = new Date(jan1.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  
  const monthStart = weekStart.toLocaleDateString('en-US', { month: 'short' });
  const monthEnd = weekEnd.toLocaleDateString('en-US', { month: 'short' });
  const dayStart = weekStart.getDate();
  const dayEnd = weekEnd.getDate();
  
  if (monthStart === monthEnd) {
    return `Week of ${monthStart} ${dayStart}-${dayEnd}`;
  }
  return `Week of ${monthStart} ${dayStart} - ${monthEnd} ${dayEnd}`;
}
function CoachingSection({ 
  title, 
  content, 
  emoji 
}: { 
  title: string; 
  content: string; 
  emoji: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-slate-300">
        {emoji} {title}
      </div>
      <div className="text-xs text-slate-400 pl-2">
        {content}
      </div>
    </div>
  );
}