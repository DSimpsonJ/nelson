import { notFound } from "next/navigation";
import Link from "next/link";
import { getItemBySlug } from "../../../data/learnContent";

export default function LearnItemPage({ params }: { params: { slug: string } }) {
  const item = getItemBySlug(params.slug);

  if (!item) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href="/learn"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          ← Back to Learn
        </Link>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <span className="capitalize">{item.format}</span>
            <span>·</span>
            <span>{item.duration}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{item.title}</h1>
        </div>

        {/* Content */}
        <div className="bg-white rounded-lg p-6 border border-gray-200">
          {item.format === "watch" ? (
            <div className="space-y-4">
              {/* Video placeholder container */}
              <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <svg
                    className="w-16 h-16 mx-auto mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>
              {/* Video text content */}
              <div className="prose prose-gray max-w-none">
                <p className="whitespace-pre-line text-gray-700 leading-relaxed">
                  {item.content}
                </p>
              </div>
            </div>
          ) : (
            <div className="prose prose-gray max-w-none">
              <p className="whitespace-pre-line text-gray-700 leading-relaxed">
                {item.content}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}