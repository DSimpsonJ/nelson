'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getWeightTrend, logWeight, getLatestWeightEntry } from '@/app/services/weightService';
import { WeightTrend } from '@/app/types/weight';
import { getEmail } from '@/app/utils/getEmail';
import { formatDistanceToNow } from 'date-fns';

function formatWeight(weight: number): string {
  return weight % 1 === 0 ? weight.toString() : weight.toFixed(1);
}

function formatLastLogged(date: string): string {
  const logDate = new Date(date + 'T00:00:00');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const logDateStr = logDate.toDateString();
  const todayStr = today.toDateString();
  const yesterdayStr = yesterday.toDateString();
  
  if (logDateStr === todayStr) return 'Today';
  if (logDateStr === yesterdayStr) return 'Yesterday';
  
  const daysAgo = Math.floor((today.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysAgo < 7) return `${daysAgo} days ago`;
  
  return logDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function WeightCard() {
  const [trend, setTrend] = useState<WeightTrend | null>(null);
  const [lastLoggedDate, setLastLoggedDate] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrend();
  }, []);

  const loadTrend = async () => {
    const email = getEmail();
    if (!email) return;

    try {
      const [data, latestEntry] = await Promise.all([
        getWeightTrend(email),
        getLatestWeightEntry(email)
      ]);
      setTrend(data);
      if (latestEntry) {
        setLastLoggedDate(latestEntry.date);
      }
    } catch (error) {
      console.error('Failed to load weight trend:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    const email = getEmail();
    if (!email) return;

    const weight = parseFloat(weightInput);
    if (isNaN(weight) || weight < 50 || weight > 500) {
      alert('Please enter a valid weight between 50-500 lbs');
      return;
    }

    setSubmitting(true);

    try {
      await logWeight(email, weight);
      await loadTrend();
      setShowModal(false);
      setWeightInput('');
    } catch (error) {
      console.error('Failed to log weight:', error);
      alert('Failed to log weight. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <div className="animate-pulse">
          <div className="h-3 bg-slate-700 rounded w-16 mb-3"></div>
          <div className="h-6 bg-slate-700 rounded w-24"></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium text-white/60 uppercase tracking-wide">Weight</h3>
          <button
            onClick={() => setShowModal(true)}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Log Weight
          </button>
        </div>

        {trend?.current ? (
          <div>
            <div className="flex items-baseline gap-2 mb-1">
              <div className="text-2xl font-semibold text-white/70">
                {formatWeight(trend.current)} lbs
              </div>
            </div>
            <p className="text-xs text-white/40 mb-1">{trend.message}</p>
            {lastLoggedDate && (
              <p className="text-xs text-white/30">Last logged: {formatLastLogged(lastLoggedDate)}</p>
            )}
          </div>
        ) : (
          <div>
            <p className="text-white/40 text-sm mb-1">No weight logged</p>
            <p className="text-xs text-white/30">Log weekly to see trend</p>
          </div>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => !submitting && setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-800 rounded-2xl p-6 max-w-sm w-full border border-slate-700"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-white mb-4">Log Weight</h3>
              
              <div className="mb-6">
                <label className="block text-sm text-white/60 mb-2">
                  Weight (lbs)
                </label>
                <input
                  type="number"
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  placeholder="185.0"
                  step="0.1"
                  min="50"
                  max="500"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white text-lg focus:outline-none focus:border-blue-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !submitting) {
                      handleSubmit();
                    }
                  }}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}