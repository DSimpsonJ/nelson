import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/app/firebase/config";

export type Article = {
  slug: string;
  title: string;
  format: "read" | "watch";
  duration: string;
  category: string;
  content: string;
  releaseType: "drip" | "broadcast";
  dayNumber?: number;
  publishedAt?: string;
  isPublished: boolean;
};

/**
 * Calculate user's account age in days
 */
export const calculateAccountAge = (firstCheckinDate: string): number => {
  const today = new Date().toLocaleDateString("en-CA"); // "YYYY-MM-DD"
  const start = new Date(firstCheckinDate);
  const end = new Date(today);
  
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays + 1; // Day 1 = first check-in day
};

/**
 * Fetch all published articles from Firestore
 */
export const fetchPublishedArticles = async (): Promise<Article[]> => {
  try {
    const articlesRef = collection(db, "articles");
    const articlesQuery = query(
      articlesRef,
      where("isPublished", "==", true)
    );
    
    const articlesSnap = await getDocs(articlesQuery);
    const articles: Article[] = [];
    
    articlesSnap.forEach((doc) => {
      articles.push(doc.data() as Article);
    });
    
    return articles;
  } catch (error) {
    console.error("Error fetching articles:", error);
    return [];
  }
};

/**
 * Get eligible articles for a user based on account age
 */
export const getEligibleArticles = (
  allArticles: Article[],
  accountAgeDays: number
): Article[] => {
  const eligible = allArticles.filter(article => {
    if (article.releaseType === "drip" && article.dayNumber !== undefined) {
      return article.dayNumber <= accountAgeDays;
    }
    // Handle broadcast articles if needed in future
    return false;
  });
  
  // Sort by dayNumber (earliest first)
  eligible.sort((a, b) => (a.dayNumber || 0) - (b.dayNumber || 0));
  
  return eligible;
};

/**
 * Check if there are unread eligible articles
 * Used for blue dot indicator in navigation
 */
export const hasUnreadEligibleArticles = async (
  firstCheckinDate: string | null,
  readLearnSlugs: string[] = []
): Promise<boolean> => {
  if (!firstCheckinDate) return false;
  
  try {
    const accountAgeDays = calculateAccountAge(firstCheckinDate);
    const allArticles = await fetchPublishedArticles();
    const eligible = getEligibleArticles(allArticles, accountAgeDays);
    
    // Check if any eligible articles are unread
    const hasUnread = eligible.some(article => !readLearnSlugs.includes(article.slug));
    
    return hasUnread;
  } catch (error) {
    console.error("Error checking for unread articles:", error);
    return false;
  }
};
/**
 * Get the first unread eligible article for a user.
 * Used for the learn banner on the dashboard.
 */
export const getFirstUnreadArticle = async (
  firstCheckinDate: string | null,
  readLearnSlugs: string[] = []
): Promise<Article | null> => {
  if (!firstCheckinDate) return null;

  try {
    const accountAgeDays = calculateAccountAge(firstCheckinDate);
    const allArticles = await fetchPublishedArticles();
    const eligible = getEligibleArticles(allArticles, accountAgeDays);

    return eligible.find(article => !readLearnSlugs.includes(article.slug)) ?? null;
  } catch (error) {
    console.error("[LearnBanner] Error fetching first unread article:", error);
    return null;
  }
};