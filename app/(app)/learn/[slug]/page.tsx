"use client";

import { useEffect, useState } from "react";
import { notFound, useRouter } from "next/navigation";
import Link from "next/link";
import { doc, getDoc, setDoc, arrayUnion } from "firebase/firestore";
import { db } from "@/app/firebase/config";

type Article = {
  slug: string;
  title: string;
  format: "read" | "watch";
  duration: string;
  category: string;
  content: string;
  videoUrl?: string;
  imageUrl?: string;
};

export default function LearnItemPage({ params }: { params: Promise<{ slug: string }> }) {
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState<string>("");

  useEffect(() => {
    const unwrapParams = async () => {
      const resolvedParams = await params;
      setSlug(resolvedParams.slug);
    };
    unwrapParams();
  }, [params]);

  useEffect(() => {
    if (slug) {
      loadArticle();
    }
  }, [slug]);

  const loadArticle = async () => {
    try {
      // Fetch article from Firestore
      const articleRef = doc(db, "articles", slug);
      const articleSnap = await getDoc(articleRef);

      if (!articleSnap.exists()) {
        setLoading(false);
        return;
      }

      setArticle(articleSnap.data() as Article);
      
      // Mark as read
      await markAsRead();
      
      setLoading(false);
    } catch (error) {
      console.error("Error loading article:", error);
      setLoading(false);
    }
  };

  const markAsRead = async () => {
    try {
      const userEmail = getUserEmail();
      if (!userEmail) return;

      const userRef = doc(db, "users", userEmail);
      
      // Add this article slug to readLearnSlugs array
      await setDoc(
        userRef,
        { readLearnSlugs: arrayUnion(slug) },
        { merge: true }
      );
    } catch (error) {
      console.error("Error marking article as read:", error);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/60">Loading...</p>
      </div>
    );
  }

  if (!article) {
    notFound();
  }

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href="/learn"
          className="inline-flex items-center text-sm text-white/60 hover:text-white mb-6"
        >
          ← Back to Learn
        </Link>

        {/* Hero Image - Substack style */}
        {article.imageUrl && (
          <div className="mb-6 overflow-hidden rounded-xl">
            <img
              src={article.imageUrl}
              alt={article.title}
              className="w-full h-56 object-cover"
            />
          </div>
        )}

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-white/60 mb-2">
            <span className="capitalize">{article.format}</span>
            <span>·</span>
            <span>{article.duration}</span>
          </div>
          <h1 className="text-2xl font-bold text-white">{article.title}</h1>
        </div>

       {/* Content */}
       <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          {article.format === "watch" && article.videoUrl ? (
            <div className="space-y-4">
              {/* YouTube Video Embed */}
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  className="absolute top-0 left-0 w-full h-full rounded-lg"
                  src={article.videoUrl}
                  title={article.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          ) : (
            <div className="prose prose-invert max-w-none">
              <p className="whitespace-pre-line text-white/80 leading-relaxed">
                {article.content}
              </p>
            </div>
           )}
           </div>
         </div>
       </div>
     );
   }