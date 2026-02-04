'use client';

import { motion, AnimatePresence } from 'framer-motion';

interface SafetyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SafetyModal({ isOpen, onClose }: SafetyModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-700">
              {/* Icon */}
              <div className="flex items-center justify-center w-12 h-12 bg-amber-500/10 rounded-full mb-4">
                <span className="text-2xl">⚠️</span>
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold text-white mb-3">
                You flagged a physical warning
              </h3>

              {/* Message */}
              <div className="text-slate-300 space-y-3 mb-6">
                <p>
                  It's okay to take a break. Your body is telling you something important.
                </p>
                <p>
                  If you're experiencing pain, unusual fatigue, or something feels wrong, consider:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-slate-400 ml-2">
                  <li>Taking a rest day (or several)</li>
                  <li>Reducing intensity until you feel better</li>
                  <li>Consulting a healthcare professional if symptoms persist</li>
                </ul>
                <p className="text-sm text-slate-400 mt-4">
                  Your momentum will be here when you're ready. Health comes first.
                </p>
              </div>

              {/* Button */}
              <button
                onClick={onClose}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                Understood
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}