"use client";

import { useConfirmedSignOut } from "@/components/useConfirmedSignOut";

export default function AdminLogoutButton() {
  const { requestSignOut, signOutPending } = useConfirmedSignOut();

  return (
    <button
      onClick={requestSignOut}
      disabled={signOutPending}
      className="w-full py-2.5 bg-[var(--omlu-primary-surface)] hover:bg-red-950/20 border border-red-900/40 text-red-500 hover:text-red-400 text-xs font-bold rounded-xl transition cursor-pointer disabled:cursor-not-allowed"
    >
      Sign Out
    </button>
  );
}
