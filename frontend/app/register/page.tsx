"use client";

import Link from "next/link";
import React, { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FormToast } from "@/components/FormToast";
import { PasswordInput } from "@/components/PasswordInput";
import { LandingThemeToggle } from "@/components/LandingThemeToggle";
import { AuthErrorAlert } from "@/components/AuthErrorAlert";
import { AuthErrorPresentation, presentAuthError } from "@/lib/authError";
import { ApiError, registerRestaurant, staffLogin } from "@/lib/api";
import {
  backendFieldName,
  FieldErrors,
  firstError,
  focusField,
  validateRegistration,
} from "@/lib/formValidation";
import { RestaurantRegistrationRequest } from "@/lib/types";

const initialForm: RestaurantRegistrationRequest = {
  restaurant_name: "",
  restaurant_slug: "",
  contact_email: "",
  phone_number: "",
  city: "",
  google_review_url: "",
  owner_full_name: "",
  owner_username: "",
  owner_email: "",
  password: "",
  confirm_password: "",
  accept_terms: false,
};

type RegistrationField = keyof RestaurantRegistrationRequest;
const fieldOrder: RegistrationField[] = [
  "restaurant_name",
  "restaurant_slug",
  "contact_email",
  "phone_number",
  "city",
  "owner_full_name",
  "owner_username",
  "owner_email",
  "password",
  "confirm_password",
  "accept_terms",
];

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState<RestaurantRegistrationRequest>(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AuthErrorPresentation | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<RegistrationField>>({});
  const submissionPending = useRef(false);

  const showValidationError = useCallback((errors: FieldErrors<RegistrationField>) => {
    setFieldErrors(errors);
    const first = firstError(errors, fieldOrder);
    if (first) {
      setToast(first.message);
      setError({ message: "Please correct the highlighted fields.", retryable: false });
      focusField(first.field);
    }
  }, []);

  const setField = <K extends keyof RestaurantRegistrationRequest>(
    key: K,
    value: RestaurantRegistrationRequest[K]
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submitRegistration = async () => {
    if (submissionPending.current) return;
    const validation = validateRegistration(form);
    if (firstError(validation.errors, fieldOrder)) {
      showValidationError(validation.errors);
      return;
    }

    submissionPending.current = true;
    setLoading(true);
    setError(null);
    setFieldErrors({});

    try {
      const registration = await registerRestaurant(validation.normalized);
      await staffLogin({
        restaurant_slug: registration.restaurant_slug,
        login: validation.normalized.owner_username,
        password: validation.normalized.password,
      });
      router.push(registration.next_path || "/admin/setup");
    } catch (err) {
      if (err instanceof ApiError) {
        const field = backendFieldName(err.field) as RegistrationField | undefined;
        if (field && fieldOrder.includes(field)) {
          const nextErrors = { [field]: err.message } as FieldErrors<RegistrationField>;
          showValidationError(nextErrors);
          return;
        }
        const presented = presentAuthError(err, typeof navigator !== "undefined" && !navigator.onLine, "Something went wrong while creating your account. Please try again.");
        setError(presented);
        setToast(presented.message);
      } else {
        const presented = presentAuthError(err, typeof navigator !== "undefined" && !navigator.onLine, "Something went wrong while creating your account. Please try again.");
        setError(presented);
        setToast(presented.message);
      }
    } finally {
      submissionPending.current = false;
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitRegistration();
  };

  return (
    <div className="min-h-screen bg-[var(--omlu-muted-surface)] px-4 py-10 text-[var(--omlu-text-primary)]">
      <FormToast message={toast} onDismiss={() => setToast(null)} />
      <main className="mx-auto w-full max-w-4xl">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/" className="text-sm font-black uppercase tracking-widest text-orange-700">
              OMLU
            </Link>
            <h1 className="mt-3 text-3xl font-black tracking-tight">Create Restaurant</h1>
          </div>
          <div className="flex items-center gap-3"><LandingThemeToggle /><Link href="/login" className="text-sm font-bold text-[var(--omlu-text-primary)] underline underline-offset-4">Back to Login</Link></div>
        </div>

        {error && <AuthErrorAlert error={error} loading={loading} onRetry={() => void submitRegistration()} />}

        <form onSubmit={handleSubmit} className="rounded-lg border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-6 shadow-sm">
          <div className="grid gap-8 lg:grid-cols-2">
            <section>
              <h2 className="text-lg font-black">Restaurant</h2>
              <div className="mt-5 grid gap-4">
                <TextField name="restaurant_name" label="Restaurant name" value={form.restaurant_name} error={fieldErrors.restaurant_name} disabled={loading} onChange={(value) => setField("restaurant_name", value)} autoComplete="organization" />
                <TextField name="restaurant_slug" label="Restaurant username" value={form.restaurant_slug} error={fieldErrors.restaurant_slug} disabled={loading} onChange={(value) => setField("restaurant_slug", value.toLowerCase())} placeholder="nadha-cafe" helperText="Used to sign in to your restaurant and may appear in QR links." autoComplete="organization" />
                <TextField name="contact_email" label="Contact email" type="email" value={form.contact_email} error={fieldErrors.contact_email} disabled={loading} onChange={(value) => setField("contact_email", value)} autoComplete="email" />
                <TextField name="phone_number" label="Phone number" value={form.phone_number} error={fieldErrors.phone_number} disabled={loading} onChange={(value) => setField("phone_number", value)} inputMode="numeric" autoComplete="tel" />
                <TextField name="city" label="City" value={form.city} error={fieldErrors.city} disabled={loading} onChange={(value) => setField("city", value)} autoComplete="address-level2" />
                <TextField name="google_review_url" label="Google Review URL (optional)" type="url" value={form.google_review_url || ""} error={fieldErrors.google_review_url} disabled={loading} onChange={(value) => setField("google_review_url", value)} placeholder="https://g.page/r/…/review" helperText="You can also add this later in Restaurant Settings." required={false} />
              </div>
            </section>

            <section>
              <h2 className="text-lg font-black">Owner</h2>
              <div className="mt-5 grid gap-4">
                <TextField name="owner_full_name" label="Owner full name" value={form.owner_full_name} error={fieldErrors.owner_full_name} disabled={loading} onChange={(value) => setField("owner_full_name", value)} autoComplete="name" />
                <TextField name="owner_username" label="Owner username" value={form.owner_username} error={fieldErrors.owner_username} disabled={loading} onChange={(value) => setField("owner_username", value.toLowerCase())} placeholder="anjali" helperText="This username only needs to be unique within your restaurant." autoComplete="username" />
                <TextField name="owner_email" label="Owner email" type="email" value={form.owner_email} error={fieldErrors.owner_email} disabled={loading} onChange={(value) => setField("owner_email", value)} autoComplete="email" />
                <PasswordInput name="password" label="Password" value={form.password} error={fieldErrors.password} disabled={loading} onChange={(value) => setField("password", value)} autoComplete="new-password" showChecklist />
                <PasswordInput name="confirm_password" label="Confirm password" value={form.confirm_password} error={fieldErrors.confirm_password} disabled={loading} onChange={(value) => setField("confirm_password", value)} autoComplete="new-password" />
              </div>
            </section>
          </div>

          <label className="mt-6 flex items-start gap-3 text-sm font-semibold text-[var(--omlu-text-primary)]">
            <input
              name="accept_terms"
              type="checkbox"
              checked={form.accept_terms}
              onChange={(e) => setField("accept_terms", e.target.checked)}
              disabled={loading}
              aria-invalid={Boolean(fieldErrors.accept_terms)}
              className={`mt-1 h-4 w-4 shrink-0 accent-[var(--omlu-primary-action)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--omlu-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60 ${fieldErrors.accept_terms ? "outline outline-2 outline-[var(--omlu-destructive-border)]" : ""}`}
            />
            <span>
              I confirm that I’m authorized to create this restaurant account and agree to OMLU’s{" "}
              <Link href="/terms" target="_blank" onClick={(event) => event.stopPropagation()} className="font-bold text-[var(--omlu-accent-dark)] underline underline-offset-2 hover:text-[var(--omlu-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--omlu-focus-ring)]">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" onClick={(event) => event.stopPropagation()} className="font-bold text-[var(--omlu-accent-dark)] underline underline-offset-2 hover:text-[var(--omlu-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--omlu-focus-ring)]">
                Privacy Policy
              </Link>.
              {fieldErrors.accept_terms && <span className="mt-1 block text-xs font-semibold text-[var(--omlu-destructive-text)]">{fieldErrors.accept_terms}</span>}
            </span>
          </label>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="h-12 rounded-lg border border-transparent bg-[var(--omlu-primary-action)] px-6 text-sm font-black text-[var(--omlu-primary-action-text)] shadow-sm transition-[background-color,box-shadow,filter,transform] duration-150 enabled:cursor-pointer enabled:hover:brightness-90 enabled:hover:shadow-md enabled:active:translate-y-px enabled:active:brightness-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--omlu-focus-ring)] disabled:cursor-not-allowed disabled:border-[var(--omlu-border)] disabled:bg-[var(--omlu-disabled)] disabled:text-[var(--omlu-disabled-text)] disabled:shadow-none"
            >
              {loading ? "Creating restaurant…" : "Create restaurant"}
            </button>
            <p className="text-sm text-[var(--omlu-text-secondary)]">
              Staff and kitchen users are added later by an owner or admin.
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}

function TextField({
  name,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  error,
  helperText,
  disabled,
  inputMode,
  autoComplete,
  required = true,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-bold">
      {label}
      <input
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : helperText ? `${name}-help` : undefined}
        className={`h-12 rounded-lg border bg-[var(--omlu-input-background)] px-4 text-sm font-medium text-[var(--omlu-text-primary)] outline-none transition placeholder:text-[var(--omlu-text-muted)] hover:border-[var(--omlu-text-muted)] focus:border-[var(--omlu-focus-ring)] focus:ring-2 focus:ring-[var(--omlu-focus-ring)]/25 ${
          error ? "border-red-500" : "border-[var(--omlu-border-strong)]"
        } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
        required={required}
      />
      {helperText && <span id={`${name}-help`} className="text-xs font-medium text-[var(--omlu-text-secondary)]">{helperText}</span>}
      {error && <span id={`${name}-error`} className="text-xs font-semibold text-[var(--omlu-destructive-text)]">{error}</span>}
    </label>
  );
}
