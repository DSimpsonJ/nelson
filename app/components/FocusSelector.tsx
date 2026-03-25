"use client";

import { useState } from "react";
import { FOCUS_BEHAVIOR_LABELS, FOCUS_BEHAVIORS, saveFocusBehavior } from "@/app/utils/focusBehavior";

interface FocusSelectorProps {
  userEmail: string;
  weekId: string;
  suggestedKey: string | null;
  currentFocus: string | null;
  onSaved: (key: string) => void;
}

export default function FocusSelector({
  userEmail,
  weekId,
  suggestedKey,
  currentFocus,
  onSaved,
}: FocusSelectorProps) {
  const [selected, setSelected] = useState<string | null>(currentFocus);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!currentFocus);

  const handleSelect = async (key: string) => {
    if (saving) return;
    setSelected(key);
    setSaving(true);
    try {
      await saveFocusBehavior(userEmail, key, weekId);
      setSaved(true);
      onSaved(key);
    } catch (e) {
      console.error("Failed to save focus behavior", e);
    } finally {
      setSaving(false);
    }
  };

  if (saved && selected) {
    return (
      <div className="mt-6 pt-5 border-t border-white/10">
        <p className="text-xs text-white/40 uppercase tracking-wider mb-1">This week's focus</p>
        <p className="text-white font-medium">{FOCUS_BEHAVIOR_LABELS[selected]}</p>
      </div>
    );
  }

  return (
    <div className="mt-6 pt-5 border-t border-white/10">
      <p className="text-sm text-white/70 mb-3">What's your focus this week?</p>
      <div className="flex flex-wrap gap-2">
        {FOCUS_BEHAVIORS.map((key) => {
          const isSuggested = key === suggestedKey;
          const isSelected = key === selected;
          return (
            <button
              key={key}
              onClick={() => handleSelect(key)}
              className={[
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                isSelected
                  ? "bg-blue-500 text-white"
                  : isSuggested
                  ? "bg-blue-900/60 text-blue-300 border border-blue-500/50"
                  : "bg-white/10 text-white/70 hover:bg-white/15",
              ].join(" ")}
            >
              {FOCUS_BEHAVIOR_LABELS[key]}
              {isSuggested && !isSelected && (
                <span className="ml-1 text-blue-400/70 text-xs">·</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}