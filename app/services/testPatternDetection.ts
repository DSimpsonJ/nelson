/**
 * TEST SCRIPT: Weekly Pattern Detection
 * 
 * Run this to see what pattern gets detected for your account.
 * Usage: Add this as a dev tool button or run via console.
 */

import { detectWeeklyPattern } from "@/app/services/detectWeeklyPattern";

export async function testPatternDetection(email: string) {
  console.log("=== TESTING WEEKLY PATTERN DETECTION ===");
  console.log(`Email: ${email}`);
  console.log(`Testing with last 7 days of data...`);
  console.log("");
  
  try {
    // Generate weekId (current week)
    const now = new Date();
    const weekId = `${now.getFullYear()}-W${String(Math.ceil((now.getDate()) / 7)).padStart(2, '0')}`;
    
    const pattern = await detectWeeklyPattern(email, weekId);
    
    console.log("✅ PATTERN DETECTED:");
    console.log(`   Primary Pattern: ${pattern.primaryPattern}`);
    console.log(`   Can Coach: ${pattern.canCoach}`);
    console.log(`   Days Analyzed: ${pattern.daysAnalyzed}`);
    console.log(`   Week ID: ${pattern.weekId}`);
    console.log("");
    console.log("📊 EVIDENCE POINTS:");
    pattern.evidencePoints.forEach((point, i) => {
      console.log(`   ${i + 1}. ${point}`);
    });
    console.log("");
    
    // Explain what this pattern means
    const explanations: Record<string, string> = {
      insufficient_data: "Not enough check-ins this week to detect a pattern. Need at least 4.",
      building_foundation: "User is still in early days (< 10 total check-ins). Silence is acceptable - let them build data.",
      gap_disruption: "Recent missed check-ins are affecting rhythm. Focus on getting back to consistency.",
      commitment_misaligned: "Exercise is strong but momentum is flat. Other behaviors (nutrition, sleep) need attention.",
      recovery_deficit: "Sleep and/or mindset are consistently low. Recovery is the bottleneck.",
      effort_inconsistent: "Exercise is on point but other behaviors are lagging. Effort is imbalanced.",
      variance_high: "Behavior ratings swing wildly. Inconsistency is the issue, not total effort.",
      momentum_plateau: "Consistent check-ins but momentum isn't moving. Need to adjust something.",
      building_momentum: "Momentum is trending upward. Current approach is working. Keep the pattern going."
    };
    
    console.log("💡 WHAT THIS MEANS:");
    console.log(`   ${explanations[pattern.primaryPattern]}`);
    console.log("");
    console.log("=== TEST COMPLETE ===");
    
    return pattern;
    
  } catch (error) {
    console.error("❌ TEST FAILED:", error);
    throw error;
  }
}

// Helper to add to DashboardDevTools
export function addPatternDetectionTest() {
  return `
    <button
      onClick={async () => {
        const email = getEmail();
        if (!email) return;
        
        try {
          const { testPatternDetection } = await import("@/app/services/testPatternDetection");
          await testPatternDetection(email);
          showToast({ message: "Pattern detection test complete - check console", type: "success" });
        } catch (err) {
          console.error("Test failed:", err);
          showToast({ message: "Test failed - check console", type: "error" });
        }
      }}
      className="bg-purple-600 hover:bg-purple-700 text-white rounded-md py-1 text-sm"
    >
      🧪 Test Pattern Detection
    </button>
  `;
}