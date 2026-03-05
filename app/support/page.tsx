export const metadata = {
    title: "Support — Nelson",
    description: "Get help with Nelson.",
  };
  
  export default function SupportPage() {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="border-b border-slate-700/60">
          <div className="max-w-3xl mx-auto px-6 py-8">
            <a
              href="https://thenelson.app"
              className="inline-flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors text-sm mb-8"
            >
              <span>&larr;</span>
              thenelson.app
            </a>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              Support
            </h1>
          </div>
        </div>
  
        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="bg-slate-800 rounded-lg p-8">
            <p className="text-white/70 text-sm leading-relaxed">
              Have a question or need help? Email us and we'll get back to you.
            </p>
            <a
              href="mailto:support@thenelson.app"
              className="inline-block mt-4 text-amber-400/80 hover:text-amber-400 transition-colors text-sm underline underline-offset-2"
            >
              support@thenelson.app
            </a>
          </div>
        </div>
  
        <div className="border-t border-slate-700/60 mt-8">
          <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
            <p className="text-white/30 text-xs" suppressHydrationWarning>
              &copy; {new Date().getFullYear()} Simpson Holdings LLC
            </p>
            <p className="text-white/30 text-xs">Nelson</p>
          </div>
        </div>
      </main>
    );
  }