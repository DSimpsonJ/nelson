// Learn is an opt-in reference section.
// It must not interrupt check-ins, dashboards, or momentum flow.

import Link from "next/link";
import { getItemsByCategory } from "../../data/learnContent";

export default function LearnPage() {
  const itemsByCategory = getItemsByCategory();

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Learn</h1>
        <p className="text-gray-600 mb-8">
          Reference material for calibration and momentum
        </p>

        <div className="space-y-8">
          {itemsByCategory.map(([category, items]) => (
            <div key={category}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {category}
              </h2>
              <div className="space-y-3">
                {items.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/learn/${item.slug}`}
                    className="block bg-white rounded-lg p-4 border border-gray-200 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="text-lg font-medium text-gray-900">
                        {item.title}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-gray-500 whitespace-nowrap">
                        <span className="capitalize">{item.format}</span>
                        <span>·</span>
                        <span>{item.duration}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}