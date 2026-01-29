/**
 * DERIVED CONSTRAINTS LAYER
 * 
 * Firewall between raw user data and AI coaching.
 * Transforms onboarding vitals → interpreted state.
 * 
 * CRITICAL RULES:
 * 1. Never pass raw numbers to AI (weight, age, etc.)
 * 2. All outputs are interpretations, not facts
 * 3. Constraints are deterministic, not AI-guessed
 * 4. Designed for expansion (Option B fields can be added without breaking prompts)
 * 
 * Version: Option A (minimal onboarding)
 * Future: Option B (training history, schedule load, sleep constraints, injury flags)
 */

import { doc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";

// ============================================================================
// TYPES
// ============================================================================

export interface UserConstraints {
  // Capacity constraints
  recoveryCapacity: "low" | "moderate" | "high";
  timeConstraints: "minimal" | "moderate" | "flexible";
  bodyCompositionPhase: "maintenance" | "fat-loss" | "muscle-gain" | "recomp" | "unknown";
  
  // Motivational context
  primaryDriver: string; // Human-readable interpretation of primaryFocus
  
  // Baseline facts (interpreted, not raw)
  lifeStage: string; // Age-based interpretation
  biologicalContext: string; // Sex-based recovery/metabolism context
  
  // Future expansion slots (Option B)
  trainingBase?: "novice" | "returning" | "active" | "experienced";
  scheduleLoad?: "flexible" | "moderate" | "busy" | "unpredictable";
  sleepContext?: string;
  injuryFlags?: string[];
}

interface RawUserData {
  age: number;
  biologicalSex: "male" | "female";
  weight: number;
  primaryFocus: string;
  commitment: { minutes: number; type: string };
}

// ============================================================================
// INTERPRETATION LOGIC
// ============================================================================

/**
 * Derive recovery capacity from age + sex
 * 
 * Scientific basis:
 * - Recovery declines ~1% per year after 30
 * - Hormonal differences affect recovery rates
 * - This is probabilistic, not deterministic
 */
function deriveRecoveryCapacity(age: number, sex: "male" | "female"): "low" | "moderate" | "high" {
  // Age-based baseline
  if (age < 30) {
    return sex === "male" ? "high" : "high";
  }
  if (age < 45) {
    return sex === "male" ? "high" : "moderate";
  }
  if (age < 60) {
    return sex === "male" ? "moderate" : "moderate";
  }
  // 60+
  return "low";
}

/**
 * Derive time constraints from commitment level
 * 
 * Logic:
 * - 5min commitment = extremely constrained
 * - 10min commitment = minimal time available
 * - 15min+ commitment = moderate flexibility
 */
function deriveTimeConstraints(commitmentMinutes: number): "minimal" | "moderate" | "flexible" {
  if (commitmentMinutes <= 5) return "minimal";
  if (commitmentMinutes <= 10) return "minimal";
  if (commitmentMinutes <= 20) return "moderate";
  return "flexible";
}

/**
 * Infer body composition phase from focus + weight
 * 
 * Heuristics (not medical):
 * - "control" focus often indicates regaining structure → fat-loss likely
 * - Higher weight + control focus → fat-loss phase
 * - "build muscle" focus → muscle-gain phase
 * - "energy" focus → maintenance or recomp
 */
function deriveBodyCompositionPhase(
  focus: string,
  weight: number,
  sex: "male" | "female"
): "maintenance" | "fat-loss" | "muscle-gain" | "recomp" | "unknown" {
  
  const focusLower = focus.toLowerCase();
  
  // Explicit focus signals
  if (focusLower.includes("stronger") || focusLower.includes("muscle")) {
    return "muscle-gain";
  }
  
  if (focusLower.includes("control")) {
    // "Control" + higher bodyweight often = fat-loss intent
    // Rough heuristic: >200 for males, >160 for females suggests fat-loss focus
    if ((sex === "male" && weight > 200) || (sex === "female" && weight > 160)) {
      return "fat-loss";
    }
    return "recomp"; // Control without high weight = structure, not necessarily fat loss
  }
  
  if (focusLower.includes("energy")) {
    return "maintenance"; // Energy focus = optimize current state
  }
  
  if (focusLower.includes("health")) {
    return "maintenance"; // Long-term health = sustainable baseline
  }
  
  return "unknown";
}

/**
 * Translate primaryFocus code to human-readable driver
 */
function interpretPrimaryDriver(focus: string): string {
  const focusMap: Record<string, string> = {
    "consistency": "Build sustainable daily habits",
    "stronger": "Increase strength and muscle",
    "energy": "Improve daily energy and vitality",
    "control": "Regain structure and control",
    "health": "Improve long-term health markers"
  };
  
  return focusMap[focus] || "General health improvement";
}

/**
 * Derive life stage interpretation from age
 */
function deriveLifeStage(age: number): string {
  if (age < 30) return "Early career, high recovery capacity";
  if (age < 45) return "Established career, moderate recovery needs";
  if (age < 60) return "Mid-career, recovery requires more attention";
  return "Later career or retired, recovery is critical";
}

/**
 * Derive biological context from sex
 * 
 * Note: These are population-level tendencies, not individual facts
 */
function deriveBiologicalContext(sex: "male" | "female"): string {
  if (sex === "male") {
    return "Male physiology: higher baseline muscle mass, testosterone-driven recovery";
  }
  return "Female physiology: hormonal cycling affects recovery timing, lower baseline muscle mass";
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Derive user constraints from raw Firestore data
 * 
 * This is the firewall. Raw data enters, interpreted state exits.
 * AI coaching receives ONLY the output of this function.
 * 
 * @param email - User email to fetch data for
 * @returns UserConstraints object (interpreted state)
 */
export async function deriveUserConstraints(email: string): Promise<UserConstraints> {
  
  // 1. Fetch raw data from Firestore
  const userRef = doc(db, "users", email);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) {
    throw new Error(`User ${email} not found`);
  }
  
  const userData = userSnap.data();
  
  // Extract raw fields (Option A)
  const age = userData.age || 35; // Default if missing
  const sex = userData.biologicalSex || "male";
  const weight = userData.weight || 180;
  const focus = userData.primaryFocus || "health";
  const commitmentMinutes = userData.commitment?.minutes || 10;
  
  // 2. Derive constraints
  const constraints: UserConstraints = {
    recoveryCapacity: deriveRecoveryCapacity(age, sex),
    timeConstraints: deriveTimeConstraints(commitmentMinutes),
    bodyCompositionPhase: deriveBodyCompositionPhase(focus, weight, sex),
    primaryDriver: interpretPrimaryDriver(focus),
    lifeStage: deriveLifeStage(age),
    biologicalContext: deriveBiologicalContext(sex)
  };
  
  // 3. Option B fields (future expansion - leave undefined for now)
  // When Option B launches, add:
  // constraints.trainingBase = deriveTrainingBase(userData.trainingHistory);
  // constraints.scheduleLoad = userData.scheduleLoad || "moderate";
  // constraints.sleepContext = deriveSleepContext(userData.sleepConstraints);
  // constraints.injuryFlags = userData.injuries || [];
  
  return constraints;
}

/**
 * Format constraints as coaching context (5-8 bullets)
 * 
 * This is what gets passed to the AI prompt.
 * Human-readable, no raw numbers, concise.
 */
export function formatConstraintsForPrompt(constraints: UserConstraints): string {
  const bullets: string[] = [];
  
  // Recovery capacity
  bullets.push(`Recovery capacity is ${constraints.recoveryCapacity} (${constraints.lifeStage.toLowerCase()})`);
  
  // Time constraints
  if (constraints.timeConstraints === "minimal") {
    bullets.push("Time capacity is minimal (10min daily commitment indicates high schedule pressure)");
  } else if (constraints.timeConstraints === "moderate") {
    bullets.push("Time capacity is moderate (15-20min daily commitment available)");
  } else {
    bullets.push("Time capacity is flexible (20+ min daily commitment sustainable)");
  }
  
  // Body composition phase
  if (constraints.bodyCompositionPhase !== "unknown") {
    bullets.push(`Currently in ${constraints.bodyCompositionPhase} phase`);
  }
  
  // Primary driver
  bullets.push(`Primary motivation: ${constraints.primaryDriver}`);
  
  // Biological context (only include if relevant to interpretation)
  if (constraints.recoveryCapacity === "low") {
    bullets.push(constraints.biologicalContext.split(':')[1].trim());
  }
  
  // Option B additions (future)
  if (constraints.trainingBase) {
    bullets.push(`Training base: ${constraints.trainingBase}`);
  }
  if (constraints.scheduleLoad) {
    bullets.push(`Schedule load: ${constraints.scheduleLoad}`);
  }
  if (constraints.sleepContext) {
    bullets.push(constraints.sleepContext);
  }
  if (constraints.injuryFlags && constraints.injuryFlags.length > 0) {
    bullets.push(`Injury considerations: ${constraints.injuryFlags.join(", ")}`);
  }
  
  return bullets.join("\n");
}

// ============================================================================
// EXAMPLE OUTPUT
// ============================================================================

/**
 * Example for DJ (age 51, male, 222 lbs, "control" focus, 10min commitment):
 * 
 * Recovery capacity is moderate (mid-career, recovery requires more attention)
 * Time capacity is minimal (10min daily commitment indicates high schedule pressure)
 * Currently in fat-loss phase
 * Primary motivation: Regain structure and control
 * 
 * This tells the AI:
 * - Don't push intensity (moderate recovery)
 * - Don't suggest 45min workouts (minimal time)
 * - Protein and calorie awareness matter (fat-loss phase)
 * - User wants control, not performance (adjust tone accordingly)
 * 
 * WITHOUT ever saying: "User is 51 years old, weighs 222 lbs"
 */