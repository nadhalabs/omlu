"use client";

import type React from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, changeStaffPassword } from "@/lib/api";

function destinationForRole(role: string, restaurantSlug: string) {
  if (role === "owner" || role === "admin") return "/admin/dashboard";
  if (role === "staff") return "/staff";
  if (role === "kitchen") return `/kitchen/${restaurantSlug}`;
  return "/staff/login";
}

export default function ChangePasswordClient() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await changeStaffPassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      router.replace(destinationForRole(response.staff.role, response.staff.restaurant_slug));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Change Password</h1>
          <p className="text-sm text-zinc-500 mt-1">Set a new password before accessing the restaurant workspace.</p>
        </div>
        {error && <div className="rounded-lg border border-red-800/40 bg-red-950/20 px-3 py-2 text-sm text-red-300">{error}</div>}
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Current temporary password"
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-3 text-sm"
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password"
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-3 text-sm"
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-3 text-sm"
        />
        <button disabled={loading} className="rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-800 px-4 py-3 text-sm font-black text-white">
          {loading ? "Changing..." : "Change Password"}
        </button>
      </form>
    </div>
  );
}
