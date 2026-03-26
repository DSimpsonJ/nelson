export const MOMENTUM_PHASES = [
    { min: 1,   max: 2,        name: "Initiation"    },
    { min: 3,   max: 7,        name: "Activation"    },
    { min: 8,   max: 14,       name: "Patterning"    },
    { min: 15,  max: 21,       name: "Integration"   },
    { min: 22,  max: 29,       name: "Accumulation"  },
    { min: 30,  max: 59,       name: "Consolidation" },
    { min: 60,  max: 99,       name: "Resilience"    },
    { min: 100, max: Infinity, name: "Identity"      },
  ] as const;
  
  export function getPhaseIndex(totalCheckIns: number): number {
    const n = Math.max(totalCheckIns, 1);
    return MOMENTUM_PHASES.findIndex(p => n >= p.min && n <= p.max);
  }