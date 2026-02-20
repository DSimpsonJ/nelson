"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { getEmail } from "@/app/utils/getEmail";
import { motion, AnimatePresence } from "framer-motion";

export default function NotificationPrompt() {
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const checkPrompt = async () => {
      const email = getEmail();
      if (!email) return;

      try {
        const userDoc = await getDoc(doc(db, "users", email));
        const hasSeenPrompt = userDoc.data()?.hasSeenNotificationPrompt;

        if (!hasSeenPrompt) {
          setTimeout(() => setShowModal(true), 3000);
        }
      } catch (err) {
        console.error("Error checking notification prompt:", err);
      }
    };

    checkPrompt();
  }, []);

  const handleEnable = async () => {
    try {
      const permission = await Notification.requestPermission();
      const email = getEmail();
      
      if (email) {
        await setDoc(
          doc(db, "users", email),
          {
            hasSeenNotificationPrompt: true,
            notificationsEnabled: permission === "granted",
          },
          { merge: true }
        );
      }
      setShowModal(false);
    } catch (err) {
      console.error("Error enabling notifications:", err);
      setShowModal(false);
    }
  };

  const handleSkip = async () => {
    try {
      const email = getEmail();
      if (email) {
        await setDoc(
          doc(db, "users", email),
          { hasSeenNotificationPrompt: true, notificationsEnabled: false },
          { merge: true }
        );
      }
      setShowModal(false);
    } catch (err) {
      console.error("Error skipping notifications:", err);
      setShowModal(false);
    }
  };

  return (
    <AnimatePresence>
      {showModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-6"
          onClick={handleSkip}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-800 rounded-2xl p-8 max-w-md w-full border border-amber-500/30"
          >
            <div className="text-center mb-6">
              <div className="text-5xl mb-4">🔔</div>
              <h2 className="text-2xl font-bold text-white mb-3">
                Set a daily reminder?
              </h2>
              <p className="text-white/70">
                We'll nudge you to check in each day.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleEnable}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-lg transition-all"
              >
                Enable Reminders
              </button>
              <button
                onClick={handleSkip}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-lg transition-all"
              >
                Maybe Later
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}