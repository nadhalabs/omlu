"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FormToast } from "@/components/FormToast";
import { PasswordInput } from "@/components/PasswordInput";
import { LandingThemeToggle } from "@/components/LandingThemeToggle";
import { AuthErrorAlert } from "@/components/AuthErrorAlert";
import { AuthErrorPresentation, presentAuthError } from "@/lib/authError";
import { staffLogin, ApiError } from "@/lib/api";
import { FieldErrors, firstError, focusField, validateLogin } from "@/lib/formValidation";
import { roleHomePath } from "@/lib/roleRoutes";
import { StaffLoginRequest } from "@/lib/types";
import { AndroidDownloadCard } from "@/components/AndroidDownloadCard";
import {
  getActiveWebTenantScope,
  terminateWebAuthentication,
} from "@/lib/authRuntime.mjs";

const fieldOrder: (keyof StaffLoginRequest)[] = ["restaurant_slug", "login", "password"];

export default function LoginClient() {
  const router = useRouter();
  const [restaurantSlug, setRestaurantSlug] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AuthErrorPresentation | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<keyof StaffLoginRequest>>({});
  const submissionPending = useRef(false);

  useEffect(() => {
    if (getActiveWebTenantScope()) {
      void terminateWebAuthentication({
        reason: "login_route",
        clearServerSession: true,
        redirectTo: null,
      });
    }
  }, []);

  const setFieldError = useCallback((field: keyof StaffLoginRequest, message?: string) => {
    setFieldErrors((current) => ({ ...current, [field]: message }));
  }, []);

  const showValidationError = useCallback((errors: FieldErrors<keyof StaffLoginRequest>) => {
    setFieldErrors(errors);
    const first = firstError(errors, fieldOrder);
    if (first) {
      setError({ message: "Please correct the highlighted fields.", retryable: false });
      setToast(first.message);
      focusField(first.field);
    }
  }, []);

  const submitLogin = async () => {
    if (submissionPending.current) return;
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

    submissionPending.current = true;
    setLoading(true);
    setError(null);
    setFieldErrors({});

    try {
      const response = await staffLogin(payload);
      const destination = roleHomePath(response.staff);
      if (destination === "/login") {
        setError({ message: "Your account role is not allowed to access this system.", retryable: false });
        return;
      }
      router.replace(destination);
    } catch (err) {
      const presented = presentAuthError(err, typeof navigator !== "undefined" && !navigator.onLine);
      setError(presented);
      setToast(presented.message);
      if (err instanceof ApiError && !presented.retryable) {
        if (err.field && fieldOrder.includes(err.field as keyof StaffLoginRequest)) {
          const field = err.field as keyof StaffLoginRequest;
          setFieldErrors({ [field]: err.message });
          focusField(field);
        }
      }
    } finally {
      submissionPending.current = false;
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitLogin();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--omlu-muted-surface)] px-4 py-12 text-[var(--omlu-text-primary)]">
      <FormToast message={toast} onDismiss={() => setToast(null)} />
      <div className="flex w-full max-w-md flex-col gap-4 lg:max-w-4xl lg:flex-row lg:items-center">
      <main className="w-full rounded-lg border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-8 shadow-sm lg:flex-1">
        <div className="mb-2 flex justify-end"><LandingThemeToggle /></div>
        <div className="mb-8">
          <Link href="/" className="text-sm font-black uppercase tracking-widest text-orange-700">
            OMLU
          </Link>
          <h1 className="mt-3 text-2xl font-black tracking-tight">Restaurant Login</h1>
        </div>

        {error && <AuthErrorAlert error={error} loading={loading} onRetry={() => void submitLogin()} />}

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
                fieldErrors.restaurant_slug ? "border-red-500" : "border-[var(--omlu-border-strong)]"
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
                fieldErrors.login ? "border-red-500" : "border-[var(--omlu-border-strong)]"
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
            className="mt-2 h-12 rounded-lg bg-orange-500 px-6 text-sm font-bold text-[var(--omlu-primary-action-text)] transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-[var(--omlu-muted-surface)]"
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-[var(--omlu-text-secondary)]">
          New to OMLU?{" "}
          <Link href="/register" className="font-bold text-[var(--omlu-text-primary)] underline underline-offset-4">
            Create Restaurant
          </Link>
        </p>
        <footer className="mt-6 border-t border-[var(--omlu-border)] pt-4 text-center text-xs text-[var(--omlu-text-secondary)]">
          <div className="flex flex-wrap items-center justify-center gap-3 font-semibold">
            <Link href="/faq" className="hover:text-orange-600 underline">FAQ</Link>
            <Link href="/terms" className="hover:text-orange-600 underline">Terms</Link>
            <Link href="/privacy" className="hover:text-orange-600 underline">Privacy</Link>
            <Link href="/refunds" className="hover:text-orange-600 underline">Refunds</Link>
            <Link href="/acceptable-use" className="hover:text-orange-600 underline">Acceptable Use</Link>
            <Link href="/service-policy" className="hover:text-orange-600 underline">Service Policy</Link>
          </div>
        </footer>
      </main>
      <AndroidDownloadCard variant="login" className="w-full lg:max-w-sm" />
      </div>
    </div>
  );
}
