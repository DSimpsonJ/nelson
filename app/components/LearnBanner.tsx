"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { getFirstUnreadArticle } from "@/app/services/learnService";
import { useRouter } from "next/navigation";

interface LearnBannerProps {
  userEmail: string;
  firstCheckinDate: string | null;
  readLearnSlugs: string[];
}

export default function LearnBanner({
  userEmail,
  firstCheckinDate,
  readLearnSlugs,
}: LearnBannerProps) {
  const router = useRouter();
  const [bannerCopy, setBannerCopy] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!userEmail || !firstCheckinDate) return;

    const checkBanner = async () => {
      try {
        const article = await getFirstUnreadArticle(firstCheckinDate, readLearnSlugs);
        if (!article) return;

        // Check if user already dismissed this specific article's banner
        const userRef = doc(db, "users", userEmail);
        const userSnap = await getDoc(userRef);
        const lastDismissedSlug = userSnap.data()?.learnBannerLastSlug ?? null;

        if (lastDismissedSlug === article.slug) return;

        // Build copy based on format
        const copy =
          article.format === "watch"
            ? `Your ${article.title} is ready in Learn`
            : `${article.title} is available in Learn`;

        setBannerCopy(copy);
        setVisible(true);
      } catch (error) {
        console.error("[LearnBanner] Error:", error);
      }
    };

    checkBanner();
  }, [userEmail, firstCheckinDate, readLearnSlugs]);

  const handleDismiss = async () => {
    setVisible(false);
    try {
      const article = await getFirstUnreadArticle(firstCheckinDate, readLearnSlugs);
      if (!article) return;
      await setDoc(
        doc(db, "users", userEmail),
        { learnBannerLastSlug: article.slug },
        { merge: true }
      );
    } catch (error) {
      console.error("[LearnBanner] Dismiss error:", error);
    }
  };

  const handleGoToLearn = () => {
    router.push("/learn");
  };

  if (!visible || !bannerCopy) return null;

  return (
    <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3 mb-4">
      <button
        onClick={handleGoToLearn}
        className="text-sm text-white/80 text-left hover:text-white transition-colors"
      >
        {bannerCopy} →
      </button>
      <button
        onClick={handleDismiss}
        className="text-xs text-white/30 hover:text-white/50 transition-colors ml-4 shrink-0"
      >
        DISMISS
      </button>
    </div>
  );
}