"use client";

import Link from "next/link";
import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { FormToast } from "@/components/FormToast";
import { PasswordInput } from "@/components/PasswordInput";
import { staffLogin, ApiError } from "@/lib/api";
import { FieldErrors, firstError, focusField, validateLogin } from "@/lib/formValidation";
import { roleHomePath } from "@/lib/roleRoutes";
import { StaffLoginRequest } from "@/lib/types";
import { AndroidDownloadCard } from "@/components/AndroidDownloadCard";

const fieldOrder: (keyof StaffLoginRequest)[] = ["restaurant_slug", "login", "password"];

export default function LoginClient() {
  const router = useRouter();
  const [restaurantSlug, setRestaurantSlug] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<keyof StaffLoginRequest>>({});

  const setFieldError = useCallback((field: keyof StaffLoginRequest, message?: string) => {
    setFieldErrors((current) => ({ ...current, [field]: message }));
  }, []);

  const showValidationError = useCallback((errors: FieldErrors<keyof StaffLoginRequest>) => {
    setFieldErrors(errors);
    const first = firstError(errors, fieldOrder);
    if (first) {
      setError("Please correct the highlighted fields.");
      setToast(first.message);
      focusField(first.field);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const payload = {
      restaurant_slug: restaurantSlug.trim().toLowerCase(),
      login: login.trim(),
      password,
    };
    const validation = validateLogin(payload);
    if (firstError(validation, fieldOrder)) {
      showValidationError(validation);
      return;
    }

    setLoading(true);
    setError(null);
    setFieldErrors({});

    try {
      const response = await staffLogin(payload);
      const destination = roleHomePath(response.staff);
      if (destination === "/login") {
        setError("Your account role is not allowed to access this system.");
        return;
      }
      router.replace(destination);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 401
            ? "Invalid restaurant credentials, email, or password."
            : err.message
        );
        if (err.field && fieldOrder.includes(err.field as keyof StaffLoginRequest)) {
          const field = err.field as keyof StaffLoginRequest;
          setFieldErrors({ [field]: err.message });
          focusField(field);
        }
        setToast(err.message);
      } else {
        setError("Could not connect to the authentication server.");
        setToast("Could not connect to the authentication server.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 text-zinc-950">
      <FormToast message={toast} onDismiss={() => setToast(null)} />
      <div className="flex w-full max-w-md flex-col gap-4 lg:max-w-4xl lg:flex-row lg:items-center">
      <main className="w-full rounded-lg border border-zinc-200 bg-white p-8 shadow-sm lg:flex-1">
        <div className="mb-8">
          <Link href="/" className="text-sm font-black uppercase tracking-widest text-orange-700">
            OMLU
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
              name="restaurant_slug"
              value={restaurantSlug}
              onChange={(e) => {
                setRestaurantSlug(e.target.value);
                setFieldError("restaurant_slug");
              }}
              placeholder="e.g. nadha-cafe"
              disabled={loading}
              autoComplete="organization"
              aria-invalid={Boolean(fieldErrors.restaurant_slug)}
              className={`h-12 rounded-lg border px-4 text-sm font-medium outline-none transition focus:border-orange-600 ${
                fieldErrors.restaurant_slug ? "border-red-500" : "border-zinc-300"
              }`}
            />
            {fieldErrors.restaurant_slug && <span className="text-xs font-semibold text-red-600">{fieldErrors.restaurant_slug}</span>}
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Personal username or email
            <input
              type="text"
              name="login"
              value={login}
              onChange={(e) => {
                setLogin(e.target.value);
                setFieldError("login");
              }}
              placeholder="e.g. nadha"
              disabled={loading}
              autoComplete="username"
              aria-invalid={Boolean(fieldErrors.login)}
              className={`h-12 rounded-lg border px-4 text-sm font-medium outline-none transition focus:border-orange-600 ${
                fieldErrors.login ? "border-red-500" : "border-zinc-300"
              }`}
            />
            {fieldErrors.login && <span className="text-xs font-semibold text-red-600">{fieldErrors.login}</span>}
          </label>

          <PasswordInput
            name="password"
            label="Password"
            value={password}
            error={fieldErrors.password}
            disabled={loading}
            autoComplete="current-password"
            onChange={(value) => {
              setPassword(value);
              setFieldError("password");
            }}
          />

          <button
            type="submit"
            disabled={loading}
            className="mt-2 h-12 rounded-lg bg-orange-500 px-6 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-zinc-600">
          New to OMLU?{" "}
          <Link href="/register" className="font-bold text-zinc-950 underline underline-offset-4">
            Create Restaurant
          </Link>
        </p>
      </main>
      <AndroidDownloadCard variant="login" className="w-full lg:max-w-sm" />
      </div>
    </div>
  );
}
