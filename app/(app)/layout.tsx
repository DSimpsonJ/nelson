"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { getNewestArticleDate } from "../data/learnContent";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [showLearnDot, setShowLearnDot] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [hasSeenTooltip, setHasSeenTooltip] = useState(true);
  const [isCheckingCommitment, setIsCheckingCommitment] = useState(true);

  // Commitment gate - check if user has started the system
  useEffect(() => {
    checkCommitmentStatus();
  }, []);

  const checkCommitmentStatus = async () => {
    // Exclude /not-started and movement commitment page from gate
    if (
      pathname === "/not-started" ||
      pathname?.startsWith("/onboarding/setup/movement-commitment")
    ) {
      setIsCheckingCommitment(false);
      return;
    }

    try {
      const userEmail = getUserEmail();
      if (!userEmail) {
        // Not logged in - this shouldn't happen in (app) routes, but be defensive
        window.location.href = "/login";
        return;
      }

      const userRef = doc(db, "users", userEmail);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        // No user doc means no commitment
        window.location.href = "/not-started";
        return;
      }

      const userData = userSnap.data();
      const hasCommitment = userData.hasCommitment === true;

      if (!hasCommitment) {
        // User hasn't set commitment - redirect to holding page
        window.location.href = "/not-started";
        return;
      }

      // User has commitment - allow access
      setIsCheckingCommitment(false);
    } catch (error) {
      console.error("Error checking commitment status:", error);
      window.location.href = "/not-started";
    }
  };

  useEffect(() => {
    // Only check for new content after commitment check passes
    if (!isCheckingCommitment) {
      checkForNewContent();
    }
  }, [isCheckingCommitment]);

  useEffect(() => {
    // If user visits any Learn page, clear the dot
    if (pathname?.startsWith("/learn")) {
      markLearnVisited();
    }
  }, [pathname]);

  const checkForNewContent = async () => {
    try {
      const userEmail = getUserEmail();
      if (!userEmail) return;

      const userRef = doc(db, "users", userEmail);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData = userSnap.data();
        const lastLearnVisit = userData.lastLearnVisit || "2020-01-01T00:00:00Z";
        const hasSeenDotTooltip = userData.hasSeenLearnDotTooltip || false;
        
        const newestArticleDate = getNewestArticleDate();
        
        // Show dot if newest article is newer than last visit
        if (new Date(newestArticleDate) > new Date(lastLearnVisit)) {
          setShowLearnDot(true);
        }
        
        // Show tooltip on first hover if not seen before
        setHasSeenTooltip(hasSeenDotTooltip);
      }
    } catch (error) {
      console.error("Error checking for new content:", error);
    }
  };

  const markLearnVisited = async () => {
    try {
      const userEmail = getUserEmail();
      if (!userEmail) return;

      const userRef = doc(db, "users", userEmail);
      await setDoc(userRef, {
        lastLearnVisit: new Date().toISOString(),
      }, { merge: true });

      setShowLearnDot(false);
    } catch (error) {
      console.error("Error marking Learn visited:", error);
    }
  };

  const markTooltipSeen = async () => {
    try {
      const userEmail = getUserEmail();
      if (!userEmail) return;

      const userRef = doc(db, "users", userEmail);
      await setDoc(userRef, {
        hasSeenLearnDotTooltip: true,
      }, { merge: true });

      setHasSeenTooltip(true);
    } catch (error) {
      console.error("Error marking tooltip seen:", error);
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

  const navItems = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/history", label: "The Lab" },  // Renamed from "History"
    { href: "/learn", label: "Learn", showDot: showLearnDot },
  ];

  // Don't render anything until commitment check completes
  if (isCheckingCommitment) {
    return null;
  }

  return (
    <div className="min-h-screen">
      {/* Primary Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <div className="text-xl font-bold text-gray-900">Nelson</div>
              <div className="flex gap-6">
                {navItems.map((item) => {
                  const isActive = pathname?.startsWith(item.href);
                  return (
                    <div
                      key={item.href}
                      className="relative"
                      onMouseEnter={() => {
                        if (item.showDot && !hasSeenTooltip) {
                          setShowTooltip(true);
                          markTooltipSeen();
                        }
                      }}
                      onMouseLeave={() => setShowTooltip(false)}
                    >
                      <Link
                        href={item.href}
                        className={`text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${
                          isActive
                            ? "text-gray-900"
                            : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        {item.label}
                        {item.showDot && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        )}
                      </Link>
                      
                      {/* Tooltip */}
                      {item.showDot && showTooltip && !hasSeenTooltip && (
                        <div className="absolute top-full left-0 mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded whitespace-nowrap">
                          New article available
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Page Content */}
      {children}
    </div>
  );
}