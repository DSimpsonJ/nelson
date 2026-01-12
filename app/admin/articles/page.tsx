"use client";

import { useState } from "react";
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/app/firebase/config";

export default function ArticleAdminPage() {
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Calibration Basics");
  const [content, setContent] = useState("");
  const [dayNumber, setDayNumber] = useState(1);
  const [format, setFormat] = useState<"read" | "watch">("read");
  const [status, setStatus] = useState("");
  const [deleteSlug, setDeleteSlug] = useState("");

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    setSlug(generateSlug(newTitle));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("Saving...");

    try {
      const articleRef = doc(db, "articles", slug);
      
      const articleData = {
        slug,
        title,
        format,
        duration: "~60 sec",
        category,
        content: content.trim(),
        releaseType: "drip",
        dayNumber,
        isPublished: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(articleRef, articleData);
      
      setStatus(`✓ Article saved: ${slug}`);
      
      // Reset form
      setTimeout(() => {
        setSlug("");
        setTitle("");
        setContent("");
        setDayNumber(dayNumber + 1); // Auto-increment for next article
        setStatus("");
      }, 2000);
      
    } catch (error) {
      setStatus(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDelete = async () => {
    if (!deleteSlug.trim()) {
      setStatus("Enter a slug to delete");
      return;
    }

    const confirmed = window.confirm(`Delete article: ${deleteSlug}?`);
    if (!confirmed) return;

    setStatus("Deleting...");

    try {
      const articleRef = doc(db, "articles", deleteSlug);
      await deleteDoc(articleRef);
      setStatus(`✓ Deleted: ${deleteSlug}`);
      setDeleteSlug("");
    } catch (error) {
      setStatus(`✗ Delete error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const categories = [
    "Momentum Truths",
    "Calibration Basics",
    "What Solid Actually Means",
    "Common Rating Errors",
    "Rebuilds & Gaps"
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <h1 className="text-3xl font-bold mb-8">Article Admin</h1>

        {/* Create/Update Article Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg p-6 border border-gray-200 mb-8">
          <h2 className="text-xl font-bold mb-4">Create/Update Article</h2>

          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>

            {/* Auto-generated Slug */}
            <div>
              <label className="block text-sm font-medium mb-1">Slug (auto-generated)</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
              />
              <p className="text-xs text-gray-500 mt-1">Edit if needed</p>
            </div>

            {/* Day Number */}
            <div>
              <label className="block text-sm font-medium mb-1">Day Number</label>
              <input
                type="number"
                value={dayNumber}
                onChange={(e) => setDayNumber(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                min="1"
                required
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Format */}
            <div>
              <label className="block text-sm font-medium mb-1">Format</label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="read"
                    checked={format === "read"}
                    onChange={(e) => setFormat(e.target.value as "read")}
                    className="mr-2"
                  />
                  Read
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="watch"
                    checked={format === "watch"}
                    onChange={(e) => setFormat(e.target.value as "watch")}
                    className="mr-2"
                  />
                  Watch
                </label>
              </div>
            </div>

            {/* Content */}
            <div>
              <label className="block text-sm font-medium mb-1">Content</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg h-64 font-mono text-sm"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Paste article content here. Line breaks will be preserved.
              </p>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700"
            >
              Save Article
            </button>
          </div>
        </form>

        {/* Delete Article */}
        <div className="bg-white rounded-lg p-6 border border-red-200">
          <h2 className="text-xl font-bold mb-4 text-red-600">Delete Article</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={deleteSlug}
              onChange={(e) => setDeleteSlug(e.target.value)}
              placeholder="Enter slug to delete"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
            />
            <button
              onClick={handleDelete}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Status Message */}
        {status && (
          <div className="mt-4 p-4 bg-gray-100 rounded-lg text-center">
            {status}
          </div>
        )}
      </div>
    </div>
  );
}