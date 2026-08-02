import { AuthErrorPresentation } from "@/lib/authError";

export function AuthErrorAlert({ error, loading, onRetry }: { error: AuthErrorPresentation; loading: boolean; onRetry: () => void }) {
  return (
    <div role="alert" aria-live="assertive" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      {error.title && <h2 className="font-black">{error.title}</h2>}
      <p className={error.title ? "mt-1 font-semibold" : "font-semibold"}>{error.message}</p>
      {error.retryable && (
        <button type="button" onClick={onRetry} disabled={loading} className="mt-3 min-h-10 rounded-lg border border-red-300 bg-white px-4 font-bold text-red-800 transition hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--omlu-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60">
          {loading ? "Trying again..." : "Try again"}
        </button>
      )}
    </div>
  );
}
