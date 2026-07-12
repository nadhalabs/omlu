"use client";

import Link from "next/link";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { staffLogin, ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [restaurantSlug, setRestaurantSlug] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!restaurantSlug.trim() || !login.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await staffLogin({
        login: login.trim(),
        password,
        restaurant_slug: restaurantSlug.trim().toLowerCase(),
      });

      const { role, restaurant_slug } = response.staff;
      if (response.staff.must_change_password) {
        router.push("/staff/change-password");
      } else if (role === "owner" || role === "admin") {
        router.push("/admin");
      } else if (role === "staff") {
        router.push("/staff");
      } else if (role === "kitchen") {
        router.push(`/kitchen/${restaurant_slug}`);
      } else {
        setError("Your account role is not allowed to access this system.");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 401
            ? "Invalid restaurant credentials, email, or password."
            : err.message
        );
      } else {
        setError("Could not connect to the authentication server.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 text-zinc-950">
      <main className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="mb-8">
          <Link href="/" className="text-sm font-black uppercase tracking-widest text-amber-700">
            Nadha Serve
          </Link>
          <h1 className="mt-3 text-2xl font-black tracking-tight">Restaurant Login</h1>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Restaurant username
            <input
              type="text"
              value={restaurantSlug}
              onChange={(e) => setRestaurantSlug(e.target.value)}
              placeholder="nadha-cafe"
              disabled={loading}
              className="h-12 rounded-lg border border-zinc-300 px-4 text-sm font-medium outline-none transition focus:border-amber-600"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Personal username or email
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="owner or owner@example.com"
              disabled={loading}
              className="h-12 rounded-lg border border-zinc-300 px-4 text-sm font-medium outline-none transition focus:border-amber-600"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Password
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="h-12 w-full rounded-lg border border-zinc-300 px-4 pr-16 text-sm font-medium outline-none transition focus:border-amber-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-0 px-4 text-xs font-bold text-zinc-500 hover:text-zinc-900"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 h-12 rounded-lg bg-zinc-950 px-6 text-sm font-bold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-zinc-600">
          New to Nadha Serve?{" "}
          <Link href="/register" className="font-bold text-zinc-950 underline underline-offset-4">
            Create Restaurant
          </Link>
        </p>
      </main>
    </div>
  );
}
