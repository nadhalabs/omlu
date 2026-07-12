"use client";

import { useEffect } from "react";

export function FormToast({
  message,
  onDismiss,
  dark = false,
}: {
  message: string | null;
  onDismiss: () => void;
  dark?: boolean;
}) {
  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(onDismiss, 4500);
    return () => window.clearTimeout(timeout);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed left-4 right-4 top-4 z-50 mx-auto max-w-xl rounded-lg border px-4 py-3 text-sm font-semibold shadow-lg ${
        dark
          ? "border-red-800/50 bg-red-950 text-red-100"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {message}
    </div>
  );
}
