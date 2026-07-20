"use client";

import { useRouter } from "next/navigation";
import { staffLogout } from "@/lib/api";
import { useOmluUi } from "@/components/OmluUiProvider";

export default function AdminLogoutButton() {
  const router = useRouter();
  const { toast } = useOmluUi();

  const handleLogout = async () => {
    try {
      await staffLogout();
      router.replace("/login");
    } catch {
      toast("Failed to sign out. Please try again.", "error");
    }
  };

  return (
    <button
      onClick={handleLogout}
      className="w-full py-2.5 bg-zinc-900 hover:bg-red-950/20 border border-zinc-800 hover:border-red-900/40 text-zinc-400 hover:text-red-400 text-xs font-bold rounded-xl transition cursor-pointer"
    >
      Sign Out
    </button>
  );
}
