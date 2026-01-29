"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, orderBy, limit, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../../firebase/config";
import { getEmail } from "../../utils/getEmail";
import { motion } from "framer-motion";

// Types defined inline to avoid import issues
type FocusType = 'protect' | 'hold' | 'narrow' | 'ignore';
type PatternType = 'insufficient_data' | 'building_foundation' | 'gap_disruption' | 
  'commitment_misaligned' | 'recovery_deficit' | 'effort_inconsistent' | 
  'variance_high' | 'momentum_decline' | 'building_momentum' | 'momentum_plateau';
type SummaryStatus = 'generated' | 'skipped' | 'rejected';

interface ExperimentSuggestion {
  action: string;
  stopCondition: string;
}

interface WeeklyFocus {
  text: string;
  type: FocusType;
}

interface WeeklyCoachingOutput {
  acknowledgment: string;
  observation: string;
  explanation: string;
  orientation: string;
  experiment?: ExperimentSuggestion;
  focus: WeeklyFocus;
}

interface WeeklySummaryRecord {
  weekId: string;
  patternType: PatternType;
  status: SummaryStatus;
  coaching?: WeeklyCoachingOutput;
  generatedAt: Timestamp | Date | any;
  daysAnalyzed: number;
  realCheckInsThisWeek: number;
  totalLifetimeCheckIns: number;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
};

export default function CoachPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState<WeeklySummaryRecord | null>(null);
  const [historicalWeeks, setHistoricalWeeks] = useState<WeeklySummaryRecord[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['acknowledgment']));

  useEffect(() => {
    loadCoaching();
  }, []);

  const loadCoaching = async () => {
    const email = getEmail();
    if (!email) {
      router.push("/login");
      return;
    }

    try {
      const summariesRef = collection(db, "users", email, "weeklySummaries");
      const q = query(summariesRef, orderBy("generatedAt", "desc"), limit(5));
      const snapshot = await getDocs(q);

      const summaries = snapshot.docs.map(doc => ({
        ...doc.data(),
        generatedAt: doc.data().generatedAt
      })) as WeeklySummaryRecord[];

      const current = summaries.find(s => s.status === "generated");
      setCurrentWeek(current || null);

      const historical = summaries
        .filter(s => s.status === "generated" && s.weekId !== current?.weekId)
        .slice(0, 4);
      setHistoricalWeeks(historical);

    } catch (error) {
      console.error("Failed to load coaching:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-2xl mx-auto pt-8">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="text-2xl">⚡</div>
            <h1 className="text-2xl font-bold text-white">Coach</h1>
          </div>
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-8 text-center">
            <p className="text-white/60">Loading your coaching...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!currentWeek) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-2xl mx-auto pt-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="text-2xl">⚡</div>
              <h1 className="text-2xl font-bold text-white">Coach</h1>
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="text-white/60 hover:text-white text-sm"
            >
              ← Dashboard
            </button>
          </div>

          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-8 text-center space-y-3">
            <div className="text-4xl mb-4">📊</div>
            <p className="text-white font-semibold text-lg">No coaching available yet</p>
            <p className="text-white/60 text-sm max-w-md mx-auto">
              Complete at least 4 check-ins this week and reach 10 total check-ins to unlock your first weekly coaching.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-6 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </main>
    );
  }

  const { coaching } = currentWeek;
  if (!coaching) return null;

  return (
    <motion.main
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 pb-24"
    >
      <div className="max-w-2xl mx-auto pt-8">
        <motion.div variants={itemVariants} className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="text-2xl">⚡</div>
            <h1 className="text-2xl font-bold text-white">Coach</h1>
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            className="text-white/60 hover:text-white text-sm transition-colors"
          >
            ← Dashboard
          </button>
        </motion.div>

        <motion.div variants={itemVariants} className="mb-3">
          <p className="text-white/60 text-sm">
            {formatWeekId(currentWeek.weekId)} • {currentWeek.realCheckInsThisWeek}/{currentWeek.daysAnalyzed} check-ins
          </p>
        </motion.div>

        <motion.div variants={itemVariants} className="mb-6">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-6 shadow-xl border border-blue-500/50">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold text-blue-200 uppercase tracking-wider">
                🎯 Weekly Focus
              </div>
              <div className="px-2 py-1 bg-blue-800/50 rounded text-xs font-medium text-blue-200 uppercase">
                {coaching.focus.type}
              </div>
            </div>
            <p className="text-white text-lg font-semibold leading-relaxed">
              {coaching.focus.text}
            </p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="space-y-3 mb-8">
          <div className="text-sm font-semibold text-white/80 mb-3 uppercase tracking-wide">
            Weekly Review
          </div>

          <ReviewSection
            title="Acknowledgment"
            emoji="👋"
            content={coaching.acknowledgment}
            isExpanded={expandedSections.has('acknowledgment')}
            onToggle={() => toggleSection('acknowledgment')}
          />

          <ReviewSection
            title="Observation"
            emoji="👁️"
            content={coaching.observation}
            isExpanded={expandedSections.has('observation')}
            onToggle={() => toggleSection('observation')}
          />

          <ReviewSection
            title="Explanation"
            emoji="💡"
            content={coaching.explanation}
            isExpanded={expandedSections.has('explanation')}
            onToggle={() => toggleSection('explanation')}
          />

          <ReviewSection
            title="Orientation"
            emoji="🧭"
            content={coaching.orientation}
            isExpanded={expandedSections.has('orientation')}
            onToggle={() => toggleSection('orientation')}
          />

          {coaching.experiment && (
            <ExperimentSection experiment={coaching.experiment} />
          )}
        </motion.div>

        {historicalWeeks.length > 0 && (
          <motion.div variants={itemVariants} className="mt-12">
            <div className="text-sm font-semibold text-white/80 mb-4 uppercase tracking-wide">
              Previous Weeks
            </div>
            <div className="space-y-3">
              {historicalWeeks.map(week => (
                <HistoricalWeekCard key={week.weekId} week={week} />
              ))}
            </div>
          </motion.div>
        )}

        <div className="h-8" />
      </div>
    </motion.main>
  );
}

function ReviewSection({
  title,
  emoji,
  content,
  isExpanded,
  onToggle
}: {
  title: string;
  emoji: string;
  content: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-700/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{emoji}</span>
          <span className="text-white font-medium">{title}</span>
        </div>
        <span className="text-white/60 text-lg">
          {isExpanded ? '−' : '+'}
        </span>
      </button>
      
      {isExpanded && (
        <div className="px-5 pb-5 pt-1">
          <p className="text-white/80 leading-relaxed">
            {content}
          </p>
        </div>
      )}
    </div>
  );
}

function ExperimentSection({ 
  experiment 
}: { 
  experiment: { action: string; stopCondition: string } 
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 border border-purple-700/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-purple-700/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">🧪</span>
          <span className="text-white font-medium">Optional Experiment</span>
        </div>
        <span className="text-white/60 text-lg">
          {isExpanded ? '−' : '+'}
        </span>
      </button>
      
      {isExpanded && (
        <div className="px-5 pb-5 pt-1 space-y-3">
          <div>
            <div className="text-xs font-semibold text-purple-300 uppercase tracking-wide mb-1">
              Test
            </div>
            <p className="text-white/80 leading-relaxed">
              {experiment.action}
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold text-purple-300 uppercase tracking-wide mb-1">
              Stop If
            </div>
            <p className="text-white/80 leading-relaxed">
              {experiment.stopCondition}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoricalWeekCard({ week }: { week: WeeklySummaryRecord }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-700/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm text-white/80">
            {formatWeekId(week.weekId)}
          </span>
          <span className="text-xs text-white/40">
            {week.realCheckInsThisWeek}/{week.daysAnalyzed}
          </span>
        </div>
        <span className="text-white/40 text-sm">
          {isExpanded ? '−' : '+'}
        </span>
      </button>

      {isExpanded && week.coaching && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-700/30 pt-3">
          <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-3">
            <div className="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-1">
              🎯 Focus • {week.coaching.focus.type}
            </div>
            <p className="text-white/90 text-sm leading-relaxed">
              {week.coaching.focus.text}
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <HistoricalReviewLine 
              title="Acknowledgment" 
              content={week.coaching.acknowledgment} 
            />
            <HistoricalReviewLine 
              title="Observation" 
              content={week.coaching.observation} 
            />
            <HistoricalReviewLine 
              title="Explanation" 
              content={week.coaching.explanation} 
            />
            <HistoricalReviewLine 
              title="Orientation" 
              content={week.coaching.orientation} 
            />
          </div>
        </div>
      )}
    </div>
  );
}

function HistoricalReviewLine({ 
  title, 
  content 
}: { 
  title: string; 
  content: string;
}) {
  return (
    <div>
      <div className="text-white/50 font-medium mb-0.5">{title}</div>
      <div className="text-white/70 leading-relaxed">{content}</div>
    </div>
  );
}

function formatWeekId(weekId: string): string {
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