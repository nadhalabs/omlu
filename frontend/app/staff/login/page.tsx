"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { staffLogin, ApiError } from "@/lib/api";

export default function StaffLoginPage() {
  const router = useRouter();

  // Form states
  const [restaurantSlug, setRestaurantSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // UI states
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!restaurantSlug.trim() || !email.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await staffLogin({
        email: email.trim(),
        password: password,
        restaurant_slug: restaurantSlug.trim(),
      });

      const { role, restaurant_slug } = response.staff;

      // Reject waiters from accessing the kitchen dashboard
      if (role === "waiter") {
        setError("Waiters do not have permission to access the kitchen dashboard.");
        setLoading(false);
        return;
      }

      // Successful login redirect
      router.push(`/kitchen/${restaurant_slug}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError("Invalid restaurant credentials, email, or password.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Could not connect to the authentication server.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-zinc-950 px-4 py-12 text-zinc-100">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        {/* Subtle decorative top bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-amber-600"></div>

        {/* Brand/Header */}
        <div className="text-center mb-8">
          <span className="text-xs font-extrabold uppercase tracking-widest text-amber-500">
            Nadha Serve Staff
          </span>
          <h1 className="text-2xl font-black text-white mt-1">Sign In</h1>
          <p className="text-zinc-500 text-xs mt-1.5">
            Access your restaurant kitchen dashboard
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-950/40 border border-red-900/50 text-red-400 text-xs font-semibold p-4 rounded-2xl mb-6">
            ⚠️ {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Restaurant Slug */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
              Restaurant ID / Slug
            </label>
            <input
              type="text"
              value={restaurantSlug}
              onChange={(e) => setRestaurantSlug(e.target.value)}
              placeholder="e.g. nadha-demo-cafe"
              disabled={loading}
              className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 focus:border-amber-600 rounded-xl text-sm outline-none transition text-white placeholder-zinc-700"
            />
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. kitchen@nadhaserve.local"
              disabled={loading}
              className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 focus:border-amber-600 rounded-xl text-sm outline-none transition text-white placeholder-zinc-700"
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                className="w-full pl-4 pr-12 py-3 bg-zinc-950 border border-zinc-800 focus:border-amber-600 rounded-xl text-sm outline-none transition text-white placeholder-zinc-700"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-4 text-zinc-500 hover:text-zinc-300 text-xs font-semibold cursor-pointer select-none"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3.5 rounded-xl font-bold text-white text-center shadow-md transition cursor-pointer flex items-center justify-center gap-2 mt-2 ${
              loading
                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-800"
                : "bg-amber-600 hover:bg-amber-700 active:bg-amber-800"
            }`}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-zinc-500 border-t-transparent"></div>
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
