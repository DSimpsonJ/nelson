"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { useMomentumHistory } from "./useMomentumHistory";

export default function HistoryPage() {
  const router = useRouter();
  const { loading, allHistory, currentWindow, comparisonWindow, accountAgeDays, comparisonSize } = useMomentumHistory();
  const [showComparison, setShowComparison] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <p className="text-white/60">Loading history...</p>
      </main>
    );
  }

  // Exercise gate status (forward-looking state)
  const latest = currentWindow[currentWindow.length - 1];
  const increaseStatus = latest?.exerciseCompleted === false ? "DISABLED" : "ENABLED";

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => router.push("/dashboard")}
          className="mb-6 flex items-center gap-2 text-white/60 hover:text-white transition-colors"
        >
          <span className="text-xl">←</span>
          <span className="text-sm font-medium">Back to Dashboard</span>
        </button>

        <h1 className="text-2xl font-bold text-white mb-6">Your History</h1>
{/* Sections */}
<div className="space-y-4">
        {/* Section 1: Momentum Trend */}
<div className="bg-slate-800/40 border border-slate-700 rounded-lg p-6">
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-3">
      <h2 className="text-lg font-semibold text-white">Momentum Trend</h2>
      <div className={`text-sm px-2 py-1 rounded ${
        increaseStatus === "ENABLED"
          ? "bg-emerald-900/30 text-emerald-400"
          : "bg-amber-900/30 text-amber-400"
      }`}>
        Increases: {increaseStatus}
      </div>
    </div>
    <button
      onClick={() => setShowComparison(!showComparison)}
      disabled={comparisonSize === 0 || comparisonWindow.length === 0}
      className={`text-sm px-3 py-1 rounded transition-colors ${
        comparisonSize === 0 || comparisonWindow.length === 0
          ? "bg-slate-700/50 text-white/30 cursor-not-allowed"
          : showComparison
            ? "bg-blue-600 text-white"
            : "bg-slate-700 text-white/60 hover:text-white"
      }`}
    >
      {comparisonSize === 0 
        ? "Comparison available soon"
        : `Compare previous ${comparisonSize} days`
      }
    </button>
  </div>

  <div className="h-64">
    <ResponsiveContainer width="100%" height="100%">
      {(() => {
        const N = currentWindow.length;
        
        const chartData = Array.from({ length: N }, (_, i) => {
          const cur = currentWindow[i];
          const prev = comparisonWindow[i];

          return {
            i,
            date: cur?.date,
            current: cur?.momentumScore ?? null,
            currentType: cur?.checkinType,
            prev: prev?.momentumScore ?? null,
            prevDate: prev?.date ?? null,
            prevType: prev?.checkinType ?? null,
          };
        });

        const formatMD = (dateStr?: string | null) => {
          if (!dateStr) return "";
          const [, mm, dd] = dateStr.split("-");
          return `${parseInt(mm, 10)}/${parseInt(dd, 10)}`;
        };

        return (
          <LineChart data={chartData}>
            <XAxis
              dataKey="i"
              tickFormatter={(i) => {
                const d = chartData[i]?.date;
                if (!d) return "";
                const [, mm, dd] = d.split("-");
                return `${parseInt(mm, 10)}/${parseInt(dd, 10)}`;
              }}
              stroke="#64748B"
              fontSize={12}
            />
            <YAxis
              domain={[0, 100]}
              stroke="#64748B"
              fontSize={12}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload;

                return (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 shadow-lg">
                    <p className="text-xs text-white/60">{formatMD(p.date)}</p>
                    <p className="text-sm font-bold text-white">
                      Current: {p.current ?? "—"}%
                    </p>
                    {showComparison && p.prev !== null && (
                      <p className="text-sm font-bold text-white/70">
                        Prev: {p.prev}% <span className="text-xs text-white/40">({formatMD(p.prevDate)})</span>
                      </p>
                    )}
                    {p.currentType === "gap_fill" && (
                      <p className="text-xs text-white/40">Gap day</p>
                    )}
                  </div>
                );
              }}
            />
            {showComparison && (
              <Line
                type="monotone"
                dataKey="prev"
                stroke="#64748B"
                strokeWidth={2}
                dot={false}
                strokeDasharray="5 5"
                opacity={0.35}
                connectNulls
              />
            )}
            <Line
              type="monotone"
              dataKey="current"
              stroke="#2563EB"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </LineChart>
        );
      })()}
    </ResponsiveContainer>
  </div>

  <p className="text-xs text-white/40 mt-2 text-center">
    Primary view: Last {currentWindow.length} days (rolling)
  </p>
</div>

{/* Section 2: Stats Bar */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-6">
            <div className="text-center text-base font-semibold text-white mb-4">
              Days Observed: {currentWindow.length}
            </div>
            <div className="flex items-center gap-3 text-sm flex-wrap">
              <div className="px-3 py-1.5 bg-slate-900/50 rounded border border-slate-700">
                <span className="text-white/60">Check-ins: </span>
                <span className="text-white font-medium">{currentWindow.filter(d => d.checkinType === "real").length}</span>
              </div>
              <div className="px-3 py-1.5 bg-slate-900/50 rounded border border-slate-700">
                <span className="text-white/60">Missed Check-ins: </span>
                <span className="text-white font-medium">{currentWindow.filter(d => d.checkinType === "gap_fill").length}</span>
              </div>
              <div className="px-3 py-1.5 bg-slate-900/50 rounded border border-slate-700">
                <span className="text-white/60">Exercise days: </span>
                <span className="text-white font-medium">
                  {currentWindow.filter(d => d.exerciseCompleted === true).length} / {currentWindow.length}
                </span>
              </div>
              <div className="px-3 py-1.5 bg-slate-900/50 rounded border border-slate-700">
                <span className="text-white/60">Current Streak: </span>
                <span className="text-white font-medium">{currentWindow[currentWindow.length - 1]?.currentStreak || 0}</span>
              </div>
              <div className="px-3 py-1.5 bg-slate-900/50 rounded border border-slate-700">
                <span className="text-white/60">Longest Streak: </span>
                <span className="text-white font-medium">{Math.max(...allHistory.map(d => d.lifetimeStreak || 0))}</span>
              </div>
            </div>
          </div>

          {/* Section 3: Behavior Distribution */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Behavior Distribution</h2>
            
            {(() => {
              const realCheckIns = currentWindow.filter(d => d.checkinType === "real");
              
              if (realCheckIns.length === 0) {
                return <p className="text-white/40 text-sm">No check-ins in selected window</p>;
              }

              const behaviors = [
                { key: "nutrition_pattern", name: "Nutrition Pattern" },
                { key: "energy_balance", name: "Energy Balance" },
                { key: "protein", name: "Protein" },
                { key: "hydration", name: "Hydration" },
                { key: "sleep", name: "Sleep" },
                { key: "mindset", name: "Mindset" },
                { key: "movement", name: "Movement" }
              ];

              const distributions = behaviors.map(behavior => {
                const counts = { elite: 0, solid: 0, not_great: 0, off: 0 };
                
                realCheckIns.forEach(doc => {
                  const rating = doc.behaviorRatings?.[behavior.key];
                  if (rating && counts.hasOwnProperty(rating)) {
                    counts[rating as keyof typeof counts]++;
                  }
                });

                const total = realCheckIns.length;
                return {
                  name: behavior.name,
                  percentages: {
                    elite: Math.round((counts.elite / total) * 100),
                    solid: Math.round((counts.solid / total) * 100),
                    not_great: Math.round((counts.not_great / total) * 100),
                    off: Math.round((counts.off / total) * 100)
                  }
                };
              });

              const sorted = distributions.sort((a, b) => b.percentages.off - a.percentages.off);

              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left py-2 px-3 text-white/60 font-normal">Behavior</th>
                        <th className="text-right py-2 px-3 text-white/60 font-normal">Elite</th>
                        <th className="text-right py-2 px-3 text-white/60 font-normal">Solid</th>
                        <th className="text-right py-2 px-3 text-white/60 font-normal">Not Great</th>
                        <th className="text-right py-2 px-3 text-white/60 font-normal">Off</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((row, idx) => (
                        <tr key={idx} className="border-b border-slate-700/30">
                          <td className="py-2 px-3 text-white">{row.name}</td>
                          <td className="py-2 px-3 text-right text-white/70">{row.percentages.elite}%</td>
                          <td className="py-2 px-3 text-right text-white/70">{row.percentages.solid}%</td>
                          <td className="py-2 px-3 text-right text-white/70">{row.percentages.not_great}%</td>
                          <td className="py-2 px-3 text-right text-white/70">{row.percentages.off}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
            
            <p className="text-xs text-white/40 mt-3">Distribution for selected window</p>
          </div>

          {/* Section 4: Calendar */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-6 relative z-20 overflow-visible">
            {(() => {
              const latestDate = allHistory[allHistory.length - 1]?.date || new Date().toLocaleDateString("en-CA");
              const [year, month] = latestDate.split("-").map(Number);
              
              const firstDay = new Date(year, month - 1, 1).getDay();
              const daysInMonth = new Date(year, month, 0).getDate();
              
              const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
              const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
              const monthDocs = allHistory.filter(d => d.date >= monthStart && d.date <= monthEnd);
              
              const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
              
              const renderCalendar = () => {
                const weeks = [];
                let dayNum = 1;
                
                for (let week = 0; week < 6; week++) {
                  const days = [];
                  
                  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
                    if ((week === 0 && dayOfWeek < firstDay) || dayNum > daysInMonth) {
                      days.push(<div key={`empty-${week}-${dayOfWeek}`} className="h-16" />);
                    } else {
                      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                      const dayDoc = monthDocs.find(d => d.date === dateStr);
                      const isExpanded = expandedDate === dateStr;
                      
                      const behaviorOrder = [
                        { key: 'nutrition_pattern', label: 'Nutrition Pattern' },
                        { key: 'energy_balance', label: 'Energy Balance' },
                        { key: 'protein', label: 'Protein' },
                        { key: 'hydration', label: 'Hydration' },
                        { key: 'sleep', label: 'Sleep' },
                        { key: 'mindset', label: 'Mindset' },
                        { key: 'movement', label: 'Movement' }
                      ];
                      
                      const capitalize = (str: string) => {
                        return str.split('_').map(word => 
                          word.charAt(0).toUpperCase() + word.slice(1)
                        ).join(' ');
                      };
                      
                      let popupPositionClass = '';
                      let arrowPositionClass = '';
                      
                      if (dayOfWeek <= 1) {
                        popupPositionClass = 'left-0';
                        arrowPositionClass = 'left-8';
                      } else if (dayOfWeek >= 5) {
                        popupPositionClass = 'right-0';
                        arrowPositionClass = 'right-8';
                      } else {
                        popupPositionClass = 'left-1/2 transform -translate-x-1/2';
                        arrowPositionClass = 'left-1/2 transform -translate-x-1/2';
                      }
                      
                      days.push(
                        <div key={dateStr} className="h-16 relative overflow-visible">
                          <AnimatePresence mode="wait">
                            {isExpanded && dayDoc && dayDoc.checkinType === "real" && dayDoc.behaviorRatings && Object.keys(dayDoc.behaviorRatings).length > 0 && (
                              <motion.div
                                key={dateStr}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.15, ease: "easeOut" }}
                                className={`absolute bottom-full mb-2 z-50 w-96 max-w-[90vw] ${popupPositionClass}`}
                              >
                                <div className="bg-slate-900 border border-blue-500 rounded-lg shadow-xl p-4">
                                  {/* Exercise commitment status */}
                                  <div className="mb-3 pb-3 border-b border-slate-700">
                                    <div className="flex justify-between text-sm">
                                      <span className="text-white/60">Exercise commitment:</span>
                                      <span className="text-white font-medium">
                                        {dayDoc.exerciseCompleted ? "Met" : "Not met"}
                                      </span>
                                    </div>
                                  </div>
                                  
                                  <div className="text-white font-bold text-center mb-3" style={{ fontSize: '0.9375rem' }}>
                                    Behaviors
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                    {behaviorOrder.map(({ key, label }) => {
                                      const rating = dayDoc.behaviorRatings?.[key];
                                      if (!rating) return null;
                                      return (
                                        <div key={key} className="flex justify-between text-sm">
                                          <span className="text-white/60">{label}:</span>
                                          <span className="text-white font-medium">{capitalize(String(rating))}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  
                                  <div className={`absolute bottom-0 translate-y-full ${arrowPositionClass}`}>
                                    <div className="w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-blue-500"></div>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                          
                          <button
                            onClick={() => setExpandedDate(isExpanded ? null : dateStr)}
                            className={`w-full h-full border rounded p-2 hover:border-slate-600 transition-colors text-left ${
                              isExpanded ? 'border-blue-500 bg-slate-700/30' : 'border-slate-700'
                            }`}
                          >
                            <div className="text-xs text-white/60 mb-1">{dayNum}</div>
                            {dayDoc ? (
                              <div className="text-sm font-semibold text-white">
                                {dayDoc.momentumScore}%
                              </div>
                            ) : (
                              <div className="text-xs text-white/30">—</div>
                            )}
                            {dayDoc?.checkinType === "gap_fill" && (
                              <div className="text-xs text-white/40">Gap</div>
                            )}
                          </button>
                        </div>
                      );
                      dayNum++;
                    }
                  }
                  
                  weeks.push(
                    <div key={`week-${week}`} className="grid grid-cols-7 gap-1 overflow-visible">
                      {days}
                    </div>
                  );
                  
                  if (dayNum > daysInMonth) break;
                }
                
                return weeks;
              };
              
              return (
                <>
                  <h2 className="text-lg font-semibold text-white mb-4">
                    {monthNames[month - 1]} {year}
                  </h2>
                  
                  <div style={{ overflowAnchor: 'none' }} className="overflow-visible">
                    <div className="grid grid-cols-7 gap-1 mb-2">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
                        <div key={idx} className="text-center text-xs font-semibold text-white/50">{day}</div>
                      ))}
                    </div>
                    
                    <div className="space-y-1 overflow-visible">
                      {renderCalendar()}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </main>
  );
}