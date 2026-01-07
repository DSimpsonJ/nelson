export type LearnItem = {
    slug: string;
    title: string;
    format: "read" | "watch";
    duration: "~60 sec";
    category: "Calibration Basics" | "What Solid Actually Means" | "Common Rating Errors" | "Momentum Truths" | "Rebuilds & Gaps";
    content: string;
    publishedAt: string; // ISO date string
  };
  
  export const learnItems: LearnItem[] = [
    {
      slug: "momentum-basics",
      title: "Momentum Basics",
      format: "read",
      duration: "~60 sec",
      category: "Momentum Truths",
      publishedAt: "2026-01-01T00:00:00Z",
      content: `Let's take a quick moment to understand what momentum is and is not in this system. I use a physics-based momentum model to reflect recent behavior patterns. I'm less concerned with motivation or intention, and more concerned with what was actually done and what wasn't.
  
  Consider physics for a moment: an object needs applied force to start moving. Objects also slow down when that force stops or when something external impedes progress. Human behavior follows that same pattern.
  
  Here, you are both the object and the force. Daily actions apply force, and momentum reflects how much motion has accumulated.
  
  A higher momentum percentage typically indicates a stable, repeatable pattern with a solid foundation, while a lower Momentum percentage suggests rebuilding is underway. Nothing is good or bad, just indicative of what's happening.
  
  Momentum isn't something to chase, it's a signal to interpret.
  
  Check in honestly. Let the system update. Use the data to understand your pattern.
  
  That's it. Close this and live your day.`
    },
    {
      slug: "what-solid-sleep-looks-like",
      title: "What Solid Sleep Looks Like",
      format: "watch",
      duration: "~60 sec",
      category: "What Solid Actually Means",
      publishedAt: "2026-01-08T00:00:00Z",
      content: `Video content explaining the difference between Solid and Elite sleep ratings.
  
  Solid sleep: 7+ hours, woke mostly rested, normal quality. You got what you needed.
  
  Elite sleep: 7-9 hours, woke refreshed, consistent schedule, no screens before bed. Everything aligned.
  
  Most people overrate here. They got 7 hours and woke up okay, so they mark Elite. That's Solid. Elite requires the full package.
  
  If you're rating Elite sleep more than once or twice a week, you're probably miscalibrating.
  
  That's it. Close this and live your day.`
    },
    {
      slug: "the-elite-everywhere-problem",
      title: "The Elite Everywhere Problem",
      format: "read",
      duration: "~60 sec",
      category: "Common Rating Errors",
      publishedAt: "2026-01-15T00:00:00Z",
      content: `If you're rating Elite across most behaviors most days, something's wrong.
  
  Elite isn't "I did well." Elite is rare, circumstantial, and requires full execution. It's the day where everything aligned—not just effort, but timing, conditions, and outcome.
  
  Most days should be Solid. That's the design. Solid is sustainable. Solid is the target.
  
  When you mark Elite everywhere, you're inflating the data. Your momentum score climbs, but it's built on sand. The first real Off day will feel like failure instead of normal variance.
  
  Be honest about what Elite actually required. If it was just a good day, that's Solid.
  
  That's it. Close this and live your day.`
    },
    {
      slug: "momentum-is-not-a-streak",
      title: "Momentum Is Not a Streak",
      format: "watch",
      duration: "~60 sec",
      category: "Momentum Truths",
      publishedAt: "2026-01-22T00:00:00Z",
      content: `Video content explaining the difference between streaks and momentum.
  
  Streaks punish imperfection. One miss and you're back to zero. That's not how behavior works.
  
  Momentum rewards patterns. One Off day is noise. Your 21-day pattern absorbs it. The physics is honest—long streaks have more resistance to change.
  
  But three Off days in a row? That's a pattern. The system stops protecting you because the data is real.
  
  This is why you can have 93% consistency over 30 days and still have strong momentum. You're not chasing perfection. You're building something sustainable.
  
  That's it. Close this and live your day.`
    }
  ];
  
  // Helper to get items by category for list view
  export const getItemsByCategory = () => {
    const categories = [
      "Momentum Truths",
      "Calibration Basics",
      "What Solid Actually Means", 
      "Common Rating Errors",
      "Rebuilds & Gaps"
    ] as const;
    
    const grouped: { [key: string]: LearnItem[] } = {};
    
    categories.forEach(category => {
      grouped[category] = learnItems.filter(item => item.category === category);
    });
    
    // Only return categories that have items
    return Object.entries(grouped).filter(([_, items]) => items.length > 0);
  };
  
  // Helper to get single item by slug
  export const getItemBySlug = (slug: string): LearnItem | undefined => {
    return learnItems.find(item => item.slug === slug);
  };
  
  // Helper to get newest article date
  export const getNewestArticleDate = (): string => {
    const dates = learnItems.map(item => item.publishedAt);
    dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return dates[0] || "";
  };