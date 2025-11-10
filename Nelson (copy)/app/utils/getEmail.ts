export function getEmail(): string | null {
    if (typeof window === "undefined") return null;
  
    try {
      const stored = localStorage.getItem("nelsonUser");
      if (!stored) return null;
  
      const parsed = JSON.parse(stored);
      return parsed?.email ?? null;
    } catch (error) {
      console.error("Error parsing nelsonUser:", error);
      return null;
    }
  }