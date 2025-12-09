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
              Wait Nelson... What's a Check-In and Why Does it Matter?
            </h2>
            
            <p className="text-base text-gray-700 leading-relaxed mb-4">
              Most people don't fail because they lack knowledge. They fail because over time, they lose momentum. Motivation is fleeting, not every day is perfect, but that's ok! Your daily check-in gives you a small moment of honesty: "Did I show up yesterday?"
            </p>
            
            <p className="text-base text-gray-700 leading-relaxed mb-8">
              Real change happens by playing the long game, one day at a time.
            </p>

            <div className="bg-blue-50 rounded-lg p-6 mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Small Wins Lead to Big Victories
              </h3>
              <p className="text-base text-gray-700 leading-relaxed">
                Complete your first check-in, build momentum, reinforce your identity, and start your streak. Small win numero uno!  
              </p>
            </div>

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
              Here We Go {profile?.firstName || "there"}, Time For Your First Check-In!
            </h2>
            <p className="text-base text-gray-700 leading-relaxed mb-3">
              This will take a few minutes since you're learning the framework. <strong>Be honest, not perfect.</strong> This is yesterday's data for us to learn from. It's not a verdict.
            </p>
            <p className="text-base text-gray-700 leading-relaxed">
              <strong>Important:</strong> Most healthy, consistent people <em>average</em> the "Solid" category. Solid is success. Solid builds momentum. Elite days happen when everything clicks. Off days happen to the best of us.
            </p>
          </div>

          <div className="space-y-10">
            
            {/* 1. Nutrition Pattern (Quality) */}
            <div>
              <label className="block text-base font-semibold text-gray-900 mb-3">
                Nutrition Pattern
              </label>
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              First, let's learn about the <strong>quality</strong> of your meals.  Structured eating typically means: Planned, healthy meals you chose on purpose with clean, whole foods. The opposite of that usually means: grabbing whatever is convenient when you're already hungry. Foods you know aren't the healthiest.
              </p>
              <div className="space-y-3">
                {[
                  { 
                    value: "elite", 
                    label: "Elite", 
                    sublabel: "Fully structured eating with all planned whole food meals you chose with intent."
                  },
                  { 
                    value: "solid", 
                    label: "Solid", 
                    sublabel: "Mostly structured whole food meals. One or two convenience moments but nothing derailed you. Standard, sustainable healthy eating."
                  },
                  { 
                    value: "not_great", 
                    label: "Not Great", 
                    sublabel: "You mostly reacted to hunger and grabbed what was convenient."
                  },
                  { 
                    value: "off", 
                    label: "Off", 
                    sublabel: "Very few quality food items, no real plan, mostly snacks, fast food, or treats dominated the day."
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
               Energy Balance
              </label>
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                This is about how your body felt. At the upper limit, you're in 'athlete mode' dialed in with full precision. Solid is about sustainability and is foundational for who you are becoming. "Off" is the full on "I didn't care what I ate" kind of day.  So how was your overall food intake yesterday?
              </p>
              <div className="space-y-3">
                {[
                  { 
                    value: "elite", 
                    label: "Elite", 
                    sublabel: "You ate exactly what you intended. Consistent, calculated intake, no swings, no overeating or under-eating. Everything was deliberate."
                  },
                  { 
                    value: "solid", 
                    label: "Solid", 
                    sublabel: "You ate in a generally balanced way. You weren't stuffed and you weren't hungry. A normal day of eating that supports long-term health."
                  },
                  { 
                    value: "not_great", 
                    label: "Not Great", 
                    sublabel: "Some mindless eating with more snacking or extra portions than you meant to have. Not terrible, just not aligned with who you're becoming."
                  },
                  { 
                    value: "off", 
                    label: "Off", 
                    sublabel: "You knew you weren't eating in line with your goals. No sweat, it's normal for that to happen on occasion."
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
                Protein helps you build and maintain muscle as you age, supports recovery, and keeps you fuller so you're not chasing snacks all day. I'm not asking you to count grams right now, just notice if it was there. Did you include a solid protein source at most meals yesterday?
              </p>
              <div className="space-y-3">
                {[
                  { 
                    value: "elite", 
                    label: "Elite", 
                    sublabel: "You intentionally tracked your protein and hit your target. This usually means planning your meals and knowing roughly how many grams you got. It's a high-performance behavior, not something most healthy people do every day."
                  },
                  { 
                    value: "solid", 
                    label: "Solid", 
                    sublabel: "You ate good protein at all meals. Maybe not perfect, maybe not tracked, but you prioritized it through the day. This is a healthy and sustainable long-term approach for most people."
                  },
                  { 
                    value: "not_great", 
                    label: "Not Great", 
                    sublabel: "Your meals didn't really have a clear protein source, maybe one or two did, but it wasn't a priority."
                  },
                  { 
                    value: "off", 
                    label: "Off", 
                    sublabel: "Protein wasn't present yesterday. Maybe meals were rushed, skipped, or random. Structure slipped, life happens."
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
                Your current target is <strong>{profile?.plan?.hydrationTargetOz || 80} oz</strong>. You can start smaller and build up over time. 64 oz of water every day beats 120 oz twice a week. Did you hit your hydration target yesterday?
              </p>
              <div className="space-y-3">
                {[
                  { 
                    value: "elite", 
                    label: "Elite", 
                    sublabel: "You surpassed your target, stayed steady throughout the day, and consumed no caloric beverages (soda, juice, lattes, etc). Water intake was intentional and consistent."
                  },
                  { 
                    value: "solid", 
                    label: "Solid", 
                    sublabel: "You hit your hydration target or came very close, mostly avoided caloric beverages (1 soda, 1 small glass of juice, OR 1 small latte), and remained consistent throughout the day."
                  },
                  { 
                    value: "not_great", 
                    label: "Not Great", 
                    sublabel: "You weren't really in range of your target, you didn't pay much attention. You drank multiple caloric beverages or didn't drink much of anything."
                  },
                  { 
                    value: "off", 
                    label: "Off", 
                    sublabel: "You barely drank water yesterday. It just didn't happen. Rare trips to the bathroom and dark yellow urine are signs of dehydration."
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
                For most adults, 6 to 8 hours of sleep is the sweet spot for recovery.  However, the real win is consistency.
                A steady bedtime, a simple wind-down routine, and waking up feeling reasonably restored matter more than a perfect number. 
              </p>
              <div className="space-y-3">
                {[
                  { 
                    value: "elite", 
                    label: "Elite", 
                    sublabel: "You followed a consistent wind-down routine with no screens 30 minutes before bed, had lights out at your planned time, and woke up feeling fully restored. This is high-quality recovery."
                  },
                  { 
                    value: "solid", 
                    label: "Solid", 
                    sublabel: "You mostly followed your wind-down routine, lights were out close to your planned time, you got decent sleep and woke up feeling pretty good. This is where most healthy people live."
                  },
                  { 
                    value: "not_great", 
                    label: "Not Great", 
                    sublabel: "You tried, but the screens had too much appeal.  You stayed up later than you planned and now you're dragging a bit, but not completely wrecked. Not ideal, but manageable."
                  },
                  { 
                    value: "off", 
                    label: "Off", 
                    sublabel: "You feel very under-recovered and unsure of how you'll get through the day.  Maybe from stress, travel, illness, or a broken routine."
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
                There is no right answer here, but an honest daily assessment can help us spot patterns. Perhaps certain days, habits, or sleep patterns consistently make things feel easier or harder.  Overall, how was your mindset yesterday?
              </p>
              <div className="space-y-3">
                {[
                  { 
                    value: "elite", 
                    label: "Elite", 
                    sublabel: "Clear, focused, optimistic, and strong. I crushed the day, and felt great!"
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
                This is referred to as NEAT (non-exercise activity thermogenesis).  These are little activities you intentionally did beyond your exercise: stairs instead of elevator, parking farther away, walking calls, yard work, playing extra with the kids, cleaning, etc.
              </p>
              <div className="space-y-3">
                {[
                  { 
                    value: "elite", 
                    label: "Elite", 
                    sublabel: "Multiple intentional extras throughout the day. You maximized every opportunity to move."
                  },
                  { 
                    value: "solid", 
                    label: "Solid", 
                    sublabel: "One or two intentional extras beyond your main movement. You took opportunities when they appeared."
                  },
                  { 
                    value: "not_great", 
                    label: "Not Great", 
                    sublabel: "Minimal extras. Mostly sedentary outside your main commitment."
                  },
                  { 
                    value: "off", 
                    label: "Off", 
                    sublabel: "Completely sedentary beyond your main commitment (if you even did it)."
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