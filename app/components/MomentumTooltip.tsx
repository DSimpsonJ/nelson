/**
 * MOMENTUM TOOLTIP
 * 
 * Appears 5 seconds after dashboard loads (one-time only)
 * Explains momentum in a compact, dismissable bubble
 * 
 * LIGHT COLOR SCHEME for better readability
 */

import { motion, AnimatePresence } from 'framer-motion';

interface MomentumTooltipProps {
  isVisible: boolean;
  onDismiss: () => void;
}

export default function MomentumTooltip({ isVisible, onDismiss }: MomentumTooltipProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50"
        >
          {/* Pointer arrow - pointing DOWN with visible border */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rotate-45 border-r-2 border-b-2 border-slate-300" />
          
          {/* Tooltip content - OPTIMIZED TO FIT */}
          <div className="relative bg-white border-2 border-slate-300 rounded-lg shadow-2xl p-4 w-[460px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-6rem)] overflow-y-auto">
            {/* Close button */}
            <button
              onClick={onDismiss}
              className="absolute top-2.5 right-2.5 text-slate-400 hover:text-slate-700 transition-colors"
              aria-label="Dismiss"
            >
              <span className="text-xl leading-none">&times;</span>
            </button>

            {/* Headline - BIGGER PRESENCE */}
            <h3 className="text-lg font-bold text-slate-900 mb-2.5 pr-6">
              Momentum is physics.
            </h3>

            {/* Content - CLEANED UP HIERARCHY */}
            <div className="space-y-2 text-sm text-slate-700 leading-relaxed text-justify">
              <p className="italic text-slate-600">
                An object in motion remains in motion unless acted upon by an external force.
              </p>
              
              <p className="text-amber-500 font-bold text-base text-center">
                You're the object.
              </p>
              
              <p>
                The bar will track whether you're <span className="text-slate-900 font-semibold">building motion</span> or{' '}
                <span className="text-slate-900 font-semibold">standing still</span>.
              </p>
              
              <p>
                The more you show up, the more <span className="text-slate-900 font-semibold">unstoppable</span> you become. No judgment. Just data based on your effort.
              </p>
              
              <p>
                One off day won't stop you. <span className="text-slate-900 font-semibold">Patterns do.</span>
              </p>
              
              <p className="text-slate-500 text-sm mt-2">
                You don't move the boulder today. Today is the day you discovered it!
              </p>
            </div>

            {/* Footer action */}
            <button
              onClick={onDismiss}
              className="mt-4 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded transition-colors"
            >
              Let's Push!
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}