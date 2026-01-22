"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";
import { fetchPublishedArticles, getEligibleArticles, calculateAccountAge } from "@/app/services/learnService";

type Article = {
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

export default function LearnPage() {
  const [eligibleArticles, setEligibleArticles] = useState<Article[]>([]);
  const [readSlugs, setReadSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(true);

  useEffect(() => {
    loadEligibleArticles();
  }, []);

  const loadEligibleArticles = async () => {
    try {
      const userEmail = getUserEmail();
if (!userEmail) {
  setLoading(false);
  return;
}

// Check commitment gate
const userRef = doc(db, "users", userEmail);
const userSnap = await getDoc(userRef);

if (!userSnap.exists() || !userSnap.data().hasCommitment) {
  console.log("[Learn] Access denied - no commitment");
  setHasAccess(false);
  setLoading(false);
  return;
}

// Get user metadata and read articles

      // Get user metadata and read articles
      const metadataRef = doc(userRef, "metadata", "accountInfo");
      const metadataSnap = await getDoc(metadataRef);

      if (!metadataSnap.exists()) {
        console.error("No metadata found for user");
        setLoading(false);
        return;
      }

      const metadata = metadataSnap.data();
      const firstCheckinDate = metadata.firstCheckinDate;
      
      // Get read articles list
      const userData = userSnap.exists() ? userSnap.data() : {};
      const userReadSlugs = userData.readLearnSlugs || [];
      setReadSlugs(userReadSlugs);
      
      if (!firstCheckinDate) {
        console.error("No firstCheckinDate found");
        setLoading(false);
        return;
      }

      // Use service helpers
      const accountAgeDays = calculateAccountAge(firstCheckinDate);
      const allArticles = await fetchPublishedArticles();
      const eligible = getEligibleArticles(allArticles, accountAgeDays);

      console.log("[Learn Debug]", {
        firstCheckinDate,
        accountAgeDays,
        today: new Date().toLocaleDateString("en-CA"),
        eligibleCount: eligible.length,
        readSlugs: userReadSlugs
      });

      setEligibleArticles(eligible);
      setLoading(false);
    } catch (error) {
      console.error("Error loading articles:", error);
      setLoading(false);
    }
  };

  const getUserEmail = (): string | null => {
    if (typeof window === "undefined") return null;
    const userStr = localStorage.getItem("nelsonUser");
    if (!userStr) return null;
    try {
      const user = JSON.parse(userStr);
      return user.email || null;
    } catch {
      return null;
    }
  };

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h2 className="text-xl font-bold text-white mb-4">
            Complete Your Commitment First
          </h2>
          <p className="text-white/60 mb-6">
            Learn articles unlock after you set your exercise commitment.
          </p>
          <Link
            href="/dashboard"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/60">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-white mb-2">Learn</h1>
        <p className="text-white/60 mb-8">
          Reference material for calibration and momentum
        </p>

        {eligibleArticles.length === 0 ? (
          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 text-center">
            <p className="text-white/60">
              No articles available yet. Keep checking in daily.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {eligibleArticles.map((item) => {
              const isUnread = !readSlugs.includes(item.slug);
              
              return (
                <Link
                  key={item.slug}
                  href={`/learn/${item.slug}`}
                  className="block bg-slate-800 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-2">
                      {isUnread && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                      )}
                      <div>
                        <h3 className="text-lg font-medium text-white mb-1">
                          {item.title}
                        </h3>
                        <p className="text-sm text-white/60">{item.category}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-white/60 whitespace-nowrap">
                      <span className="capitalize">{item.format}</span>
                      <span>·</span>
                      <span>{item.duration}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}