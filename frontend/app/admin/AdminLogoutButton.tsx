"use client";

import { useRouter } from "next/navigation";
import { staffLogout } from "@/lib/api";

export default function AdminLogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await staffLogout();
      router.push("/staff/login");
    } catch {
      alert("Failed to sign out. Please try again.");
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
