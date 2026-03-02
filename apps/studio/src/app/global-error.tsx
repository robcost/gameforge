'use client';

/**
 * Global error boundary for the studio application.
 * Required by Next.js 16 to avoid prerender errors during build.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-900 text-slate-50">
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-4">
              Something went wrong
            </h2>
            <p className="text-slate-400 mb-6">{error.message}</p>
            <button
              onClick={reset}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
