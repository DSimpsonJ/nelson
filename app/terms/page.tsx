import { termsOfUseHTML } from "./termsContent.js";

export const metadata = {
  title: "Terms of Use — Nelson",
  description: "Terms of Use for Nelson.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="border-b border-slate-700/60">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <a
            href="https://thenelson.app"
            className="inline-flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors text-sm mb-8 group"
          >
            <span>{"<-"}</span>
            thenelson.app
          </a>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Terms of Use
          </h1>
          <p className="mt-2 text-white/50 text-sm">
            Questions?{" "}
            <a
              href="mailto:support@thenelson.app"
              className="text-amber-400/80 hover:text-amber-400 transition-colors underline underline-offset-2"
            >
              support@thenelson.app
            </a>
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="bg-white rounded-lg p-8">
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: termsOfUseHTML }}
          />
        </div>
      </div>

      <div className="border-t border-slate-700/60 mt-8">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <p className="text-white/30 text-xs" suppressHydrationWarning>
            © {new Date().getFullYear()} Simpson Holdings LLC
          </p>
          <p className="text-white/30 text-xs">Nelson</p>
        </div>
      </div>
    </main>
  );
}