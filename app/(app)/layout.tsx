"use client";

import Link from "next/link";
import { usePathname, redirect } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { ensureAuthPersistence } from "../firebase/config";
import { hasUnreadEligibleArticles } from "../services/learnService";
import { getAuth, onAuthStateChanged } from "firebase/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [showLearnDot, setShowLearnDot] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [hasSeenTooltip, setHasSeenTooltip] = useState(true);
  
  // Auth state
  const [user, setUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [hasCommitment, setHasCommitment] = useState(false);
  const [commitmentChecked, setCommitmentChecked] = useState(false);

  // Check auth and commitment on mount and pathname changes
  useEffect(() => {
    checkCommitmentStatus();
  }, [pathname]);

  const checkCommitmentStatus = async () => {
    // Exclude these paths from gate
    if (
      pathname === "/not-started" ||
      pathname?.startsWith("/onboarding/setup/movement-commitment") ||
      pathname?.startsWith("/learn")
    ) {
      setAuthReady(true);
      setCommitmentChecked(true);
      return;
    }
  
    try {
      const auth = getAuth();
          
      // Ensure persistence is set BEFORE listening to auth state
      await ensureAuthPersistence();
      
      const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        console.log("🔍 Auth state changed:", currentUser?.email || "NO USER");
        unsubscribe();
        setUser(currentUser);
        setAuthReady(true);
        
        if (!currentUser?.email) {
          setCommitmentChecked(true);
          return;
        }
  
        const userRef = doc(db, "users", currentUser.email);
        const userSnap = await getDoc(userRef);
  
        if (!userSnap.exists()) {
          setCommitmentChecked(true);
          return;
        }
  
        const userData = userSnap.data();
        setHasCommitment(userData.hasCommitment === true);
        setCommitmentChecked(true);
      });
    } catch (error) {
      console.error("Error checking commitment status:", error);
      setAuthReady(true);
      setCommitmentChecked(true);
    }
  };

  useEffect(() => {
    // Only check for new content after commitment check passes
    if (authReady && commitmentChecked && user) {
      checkForNewContent();
    }
  }, [authReady, commitmentChecked, user]);

  useEffect(() => {
    // If user visits any Learn page, clear the dot
    if (pathname?.startsWith("/learn")) {
      markLearnVisited();
    }
  }, [pathname]);

  const checkForNewContent = async () => {
    try {
      const userEmail = user?.email;
      if (!userEmail) return;

      const userRef = doc(db, "users", userEmail);
      const userSnap = await getDoc(userRef);
      
      const metadataRef = doc(userRef, "metadata", "accountInfo");
      const metadataSnap = await getDoc(metadataRef);

      if (userSnap.exists() && metadataSnap.exists()) {
        const userData = userSnap.data();
        const metadata = metadataSnap.data();
        
        const firstCheckinDate = metadata.firstCheckinDate || null;
        const readLearnSlugs = userData.readLearnSlugs || [];
        const hasSeenDotTooltip = userData.hasSeenLearnDotTooltip || false;
        
        const hasUnread = await hasUnreadEligibleArticles(
          firstCheckinDate,
          readLearnSlugs
        );
        
        setShowLearnDot(hasUnread);
        setHasSeenTooltip(hasSeenDotTooltip);
      }
    } catch (error) {
      console.error("Error checking for new content:", error);
    }
  };

  const markLearnVisited = async () => {
    try {
      const userEmail = user?.email;
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
      const userEmail = user?.email;
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

  const navItems = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/history", label: "The Lab" },
    { href: "/learn", label: "Learn", showDot: showLearnDot },
  ];

  // Redirect logic happens in render, not in effects
  if (authReady && commitmentChecked) {
    // Not logged in -> login page
    if (!user) {
      redirect("/login");
    }

    // Logged in but no commitment -> not-started page
    if (user && !hasCommitment && pathname !== "/not-started") {
      redirect("/not-started");
    }
  }

  // Don't render until checks complete
  if (!authReady || !commitmentChecked) {
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