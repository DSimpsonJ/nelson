"use client";

import { useState } from "react";
import CheckinSuccessAnimation from "@/app/components/rewards/CheckinSuccessAnimation";

type Props = {
  profile: {
    firstName?: string;
    plan?: {
      proteinTargetG?: number;
      hydrationTargetOz?: number;
    };
  };
  currentFocus: {
    target?: number;
    habit?: string;
  } | null;
  checkin: any;
  setCheckin: (val: any) => void;
  handleCheckinSubmit: () => void;
  checkinSuccess: boolean;
  setCheckinSuccess: (val: boolean) => void;
  checkinSubmitted: boolean;
};

export default function FirstTimeDashboard({ 
  profile, 
  currentFocus, 
  checkin,
  setCheckin,
  handleCheckinSubmit,
  checkinSuccess,
  setCheckinSuccess,
  checkinSubmitted
}: Props) {

  const [showCheckin, setShowCheckin] = useState(false);

  if (checkinSuccess) {
    return (
      <div className="min-h-screen bg-gray-50">
        <CheckinSuccessAnimation
          onComplete={() => {
            setCheckinSuccess(false);
            window.location.reload();
          }}
        />
      </div>
    );
  }

  if (checkinSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-md p-8 text-center max-w-md">
          <p className="text-2xl mb-4">✅</p>
          <p className="text-lg text-gray-900 font-semibold mb-2">Check-in complete!</p>
          <p className="text-gray-600">Your journey has begun.</p>
        </div>
      </div>
    );
  }

  if (!showCheckin) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          
          {/* Welcome Header */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-8 mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-3">
              Welcome, {profile?.firstName || "there"}!
            </h1>
            <p className="text-lg text-gray-700">
              Ready to start your journey with your first check-in?
            </p>
          </div>

          {/* Single Combined Card */}
          <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Wait... What's a Check-In?
            </h2>
            
            <p className="text-base text-gray-700 leading-relaxed mb-4">
              Your daily check-in is simple: Did you show up yesterday?
            </p>
            
            <p className="text-base text-gray-700 leading-relaxed mb-4">
              It takes 60 seconds. You rate 7 behaviors honestly. I use that data to calculate your momentum score.
            </p>

            <p className="text-base text-gray-700 leading-relaxed mb-8">
              One check-in = one data point. String enough together and you'll see patterns you couldn't see before. That's how you get consistent.
            </p>

            <button
              onClick={() => setShowCheckin(true)}
              className="w-full bg-green-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-green-700 transition shadow-sm"
            >
              Start My First Check-In
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Check-in form (shown after clicking "Start My First Check-In")
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Here we go {profile?.firstName || "there"}, time for your first check-in.
            </h2>
            <p className="text-base text-gray-700 leading-relaxed mb-3">
              This will take a few minutes since you're learning the framework. <strong>Be honest, not perfect.</strong> This is yesterday's data for us to learn from. It's not a verdict.
            </p>
            <p className="text-base text-gray-700 leading-relaxed">
              <strong>Important:</strong> Most healthy, consistent people average "Solid". Solid is success. Solid builds momentum. Elite days happen when <em>everything</em> clicks. Off days happen to the best of us.
            </p>
          </div>

          <div className="space-y-10">
            
            {/* 1. Nutrition Pattern (Quality) */}
            <div>
              <label className="block text-base font-semibold text-gray-900 mb-3">
                Nutrition Pattern (Quality)
              </label>
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                This measures the quality of what you ate. How structured and intentional were your food choices?
              </p>
              <div className="space-y-3">
                {[
                  { 
                    value: "elite", 
                    label: "Elite", 
                    sublabel: "All whole foods. Every meal was planned and clean, nothing processed or convenience-based."
                  },
                  { 
                    value: "solid", 
                    label: "Solid", 
                    sublabel: "Mostly whole foods with minimal processing. Maybe one meal was less clean, but the day was built around quality ingredients."
                  },
                  { 
                    value: "not_great", 
                    label: "Not Great", 
                    sublabel: "Mix of whole foods and processed convenience items. Quality wasn't the priority."
                  },
                  { 
                    value: "off", 
                    label: "Off", 
                    sublabel: "Mostly processed, fast food, or random snacks. Very few whole food choices."
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setCheckin({ ...checkin, eatingPattern: option.value })}
                    className={`w-full text-left p-4 rounded-lg border transition ${
                      checkin?.eatingPattern === option.value
                        ? "bg-blue-50 border-blue-600 shadow-sm"
                        : "bg-white border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-semibold text-base text-gray-900">{option.label}</div>
                    <div className="text-sm text-gray-600 mt-2 leading-relaxed">{option.sublabel}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Energy Balance (Quantity) */}
            <div>
              <label className="block text-base font-semibold text-gray-900 mb-3">
                Energy Balance (Quantity)
              </label>
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                This measures how much you ate. Were your portions aligned with your goals?
              </p>
              <div className="space-y-3">
                {[
                  { 
                    value: "elite", 
                    label: "Elite", 
                    sublabel: "Portions perfectly aligned with your goals. You ate exactly what you needed, not stuffed, not hungry."
                  },
                  { 
                    value: "solid", 
                    label: "Solid", 
                    sublabel: "Ate appropriately for your goals. Maybe slightly over or under, but nothing extreme. This is sustainable eating."
                  },
                  { 
                    value: "not_great", 
                    label: "Not Great", 
                    sublabel: "Noticeably overate or underate. Portions didn't match what you intended."
                  },
                  { 
                    value: "off", 
                    label: "Off", 
                    sublabel: "Way off target in either direction. Either barely ate or significantly overate."
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setCheckin({ ...checkin, energyBalance: option.value })}
                    className={`w-full text-left p-4 rounded-lg border transition ${
                      checkin?.energyBalance === option.value
                        ? "bg-blue-50 border-blue-600 shadow-sm"
                        : "bg-white border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-semibold text-base text-gray-900">{option.label}</div>
                    <div className="text-sm text-gray-600 mt-2 leading-relaxed">{option.sublabel}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Protein Intake */}
            <div>
              <label className="block text-base font-semibold text-gray-900 mb-3">
                Protein Intake
              </label>
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                Your target range is based on your body weight. Did you pay attention to protein yesterday?
              </p>
              <div className="space-y-3">
                {[
                  { 
                    value: "elite", 
                    label: "Elite", 
                    sublabel: "Tracked your intake and hit the high end of your target range. You know exactly how many grams you got."
                  },
                  { 
                    value: "solid", 
                    label: "Solid", 
                    sublabel: "Included protein at every meal and stayed in your target range. You tracked enough to know you hit it."
                  },
                  { 
                    value: "not_great", 
                    label: "Not Great", 
                    sublabel: "Missed your target range. You got some protein but didn't track or prioritize it."
                  },
                  { 
                    value: "off", 
                    label: "Off", 
                    sublabel: "Didn't think about protein at all. No attention to the target."
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setCheckin({ ...checkin, proteinHit: option.value })}
                    className={`w-full text-left p-4 rounded-lg border transition ${
                      checkin?.proteinHit === option.value
                        ? "bg-blue-50 border-blue-600 shadow-sm"
                        : "bg-white border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-semibold text-base text-gray-900">{option.label}</div>
                    <div className="text-sm text-gray-600 mt-2 leading-relaxed">{option.sublabel}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Hydration */}
            <div>
              <label className="block text-base font-semibold text-gray-900 mb-3">
                Hydration Level
              </label>
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                Target: 64+ oz of water daily. Did you stay hydrated yesterday?
              </p>
              <div className="space-y-3">
                {[
                  { 
                    value: "elite", 
                    label: "Elite", 
                    sublabel: "Hit 64+ oz with consistent water intake all day. Zero empty-calorie beverages."
                  },
                  { 
                    value: "solid", 
                    label: "Solid", 
                    sublabel: "Hit 64+ oz, mostly water. Maybe one drink with calories but you stayed hydrated."
                  },
                  { 
                    value: "not_great", 
                    label: "Not Great", 
                    sublabel: "Got fluids but relied on multiple caloric beverages instead of water."
                  },
                  { 
                    value: "off", 
                    label: "Off", 
                    sublabel: "Dehydrated. Infrequent bathroom trips and dark yellow urine."
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setCheckin({ ...checkin, hydrationHit: option.value })}
                    className={`w-full text-left p-4 rounded-lg border transition ${
                      checkin?.hydrationHit === option.value
                        ? "bg-blue-50 border-blue-600 shadow-sm"
                        : "bg-white border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-semibold text-base text-gray-900">{option.label}</div>
                    <div className="text-sm text-gray-600 mt-2 leading-relaxed">{option.sublabel}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 5. Sleep */}
            <div>
              <label className="block text-base font-semibold text-gray-900 mb-3">
                Sleep Quality
              </label>
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                Did you set yourself up for quality sleep last night?
              </p>
              <div className="space-y-3">
                {[
                  { 
                    value: "elite", 
                    label: "Elite", 
                    sublabel: "Consistent bedtime/wake time (±30 min), 7+ hours of sleep opportunity, intentional wind-down routine. Woke feeling fully restored."
                  },
                  { 
                    value: "solid", 
                    label: "Solid", 
                    sublabel: "Mostly consistent schedule, 7+ hours of sleep opportunity, some wind-down routine. Woke feeling pretty good."
                  },
                  { 
                    value: "not_great", 
                    label: "Not Great", 
                    sublabel: "Inconsistent schedule OR under 7 hours of opportunity. Woke feeling tired."
                  },
                  { 
                    value: "off", 
                    label: "Off", 
                    sublabel: "Random schedule, inadequate sleep opportunity, no routine. Woke feeling wrecked."
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setCheckin({ ...checkin, sleepHit: option.value })}
                    className={`w-full text-left p-4 rounded-lg border transition ${
                      checkin?.sleepHit === option.value
                        ? "bg-blue-50 border-blue-600 shadow-sm"
                        : "bg-white border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-semibold text-base text-gray-900">{option.label}</div>
                    <div className="text-sm text-gray-600 mt-2 leading-relaxed">{option.sublabel}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 6. Mindset */}
            <div>
              <label className="block text-base font-semibold text-gray-900 mb-3">
                Mindset Evaluation
              </label>
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                How was your mental state yesterday? This helps us spot patterns over time.
              </p>
              <div className="space-y-3">
                {[
                  { 
                    value: "elite", 
                    label: "Elite", 
                    sublabel: "Clear, focused, optimistic, and strong. You crushed the day and felt great."
                  },
                  { 
                    value: "solid", 
                    label: "Solid", 
                    sublabel: "Good and steady, no complaints. Normal energy and mental clarity. It was a good day."
                  },
                  { 
                    value: "not_great", 
                    label: "Not Great", 
                    sublabel: "Distracted, irritable, or running on low energy. You white-knuckled your way through it."
                  },
                  { 
                    value: "off", 
                    label: "Off", 
                    sublabel: "Mentally taxed or overwhelmed. It was a tough day and you didn't want to do much of anything."
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setCheckin({ ...checkin, headspace: option.value })}
                    className={`w-full text-left p-4 rounded-lg border transition ${
                      checkin?.headspace === option.value
                        ? "bg-blue-50 border-blue-600 shadow-sm"
                        : "bg-white border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-semibold text-base text-gray-900">{option.label}</div>
                    <div className="text-sm text-gray-600 mt-2 leading-relaxed">{option.sublabel}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 7. Bonus Movement */}
            <div>
              <label className="block text-base font-semibold text-gray-900 mb-3">
                Bonus Movement
              </label>
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                NEAT (non-exercise activity thermogenesis). Did you look for extra movement opportunities yesterday?
              </p>
              <div className="space-y-3">
                {[
                  { 
                    value: "elite", 
                    label: "Elite", 
                    sublabel: "You looked for movement opportunities all day and took them. Stairs, extra walking, active errands."
                  },
                  { 
                    value: "solid", 
                    label: "Solid", 
                    sublabel: "You added one or two intentional movement opportunities beyond basic daily activity."
                  },
                  { 
                    value: "not_great", 
                    label: "Not Great", 
                    sublabel: "You did basic daily movement and extra opportunities to move were unintentional."
                  },
                  { 
                    value: "off", 
                    label: "Off", 
                    sublabel: "You kept movement to a minimum and avoided doing anything extra."
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setCheckin({ ...checkin, movedToday: option.value })}
                    className={`w-full text-left p-4 rounded-lg border transition ${
                      checkin?.movedToday === option.value
                        ? "bg-blue-50 border-blue-600 shadow-sm"
                        : "bg-white border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-semibold text-base text-gray-900">{option.label}</div>
                    <div className="text-sm text-gray-600 mt-2 leading-relaxed">{option.sublabel}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleCheckinSubmit}
              disabled={
                !checkin?.headspace ||
                !checkin?.proteinHit ||
                !checkin?.hydrationHit ||
                !checkin?.energyBalance ||
                !checkin?.eatingPattern ||
                !checkin?.sleepHit ||
                !checkin?.movedToday
              }
              className="w-full bg-green-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              Complete Check-In
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}