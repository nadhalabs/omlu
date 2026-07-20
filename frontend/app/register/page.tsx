"use client";

import Link from "next/link";
import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { FormToast } from "@/components/FormToast";
import { PasswordInput } from "@/components/PasswordInput";
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
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<RegistrationField>>({});

  const showValidationError = useCallback((errors: FieldErrors<RegistrationField>) => {
    setFieldErrors(errors);
    const first = firstError(errors, fieldOrder);
    if (first) {
      setToast(first.message);
      setError("Please correct the highlighted fields.");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const validation = validateRegistration(form);
    if (firstError(validation.errors, fieldOrder)) {
      showValidationError(validation.errors);
      return;
    }

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
        setError(err.message);
        setToast(err.message);
      } else {
        setError("Could not create the restaurant account.");
        setToast("Could not create the restaurant account.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-950">
      <FormToast message={toast} onDismiss={() => setToast(null)} />
      <main className="mx-auto w-full max-w-4xl">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/" className="text-sm font-black uppercase tracking-widest text-amber-700">
              OMLU
            </Link>
            <h1 className="mt-3 text-3xl font-black tracking-tight">Create Restaurant</h1>
          </div>
          <Link href="/login" className="text-sm font-bold text-zinc-700 underline underline-offset-4">
            Back to Login
          </Link>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="grid gap-8 lg:grid-cols-2">
            <section>
              <h2 className="text-lg font-black">Restaurant</h2>
              <div className="mt-5 grid gap-4">
                <TextField name="restaurant_name" label="Restaurant name" value={form.restaurant_name} error={fieldErrors.restaurant_name} disabled={loading} onChange={(value) => setField("restaurant_name", value)} autoComplete="organization" />
                <TextField name="restaurant_slug" label="Unique restaurant username" value={form.restaurant_slug} error={fieldErrors.restaurant_slug} disabled={loading} onChange={(value) => setField("restaurant_slug", value.toLowerCase())} placeholder="nadha-cafe" helperText="This becomes your restaurant login name and may appear in QR links." autoComplete="organization" />
                <TextField name="contact_email" label="Contact email" type="email" value={form.contact_email} error={fieldErrors.contact_email} disabled={loading} onChange={(value) => setField("contact_email", value)} autoComplete="email" />
                <TextField name="phone_number" label="Phone number" value={form.phone_number} error={fieldErrors.phone_number} disabled={loading} onChange={(value) => setField("phone_number", value)} inputMode="numeric" autoComplete="tel" />
                <TextField name="city" label="City" value={form.city} error={fieldErrors.city} disabled={loading} onChange={(value) => setField("city", value)} autoComplete="address-level2" />
              </div>
            </section>

            <section>
              <h2 className="text-lg font-black">Owner</h2>
              <div className="mt-5 grid gap-4">
                <TextField name="owner_full_name" label="Owner full name" value={form.owner_full_name} error={fieldErrors.owner_full_name} disabled={loading} onChange={(value) => setField("owner_full_name", value)} autoComplete="name" />
                <TextField name="owner_username" label="Personal username" value={form.owner_username} error={fieldErrors.owner_username} disabled={loading} onChange={(value) => setField("owner_username", value.toLowerCase())} placeholder="anjali" helperText="This username is unique only inside your restaurant." autoComplete="username" />
                <TextField name="owner_email" label="Owner email" type="email" value={form.owner_email} error={fieldErrors.owner_email} disabled={loading} onChange={(value) => setField("owner_email", value)} autoComplete="email" />
                <PasswordInput name="password" label="Password" value={form.password} error={fieldErrors.password} disabled={loading} onChange={(value) => setField("password", value)} autoComplete="new-password" showChecklist />
                <PasswordInput name="confirm_password" label="Confirm password" value={form.confirm_password} error={fieldErrors.confirm_password} disabled={loading} onChange={(value) => setField("confirm_password", value)} autoComplete="new-password" />
              </div>
            </section>
          </div>

          <label className="mt-6 flex items-start gap-3 text-sm font-semibold text-zinc-700">
            <input
              name="accept_terms"
              type="checkbox"
              checked={form.accept_terms}
              onChange={(e) => setField("accept_terms", e.target.checked)}
              className={`mt-1 h-4 w-4 accent-zinc-950 ${fieldErrors.accept_terms ? "outline outline-2 outline-red-500" : ""}`}
            />
            <span>
              I accept the terms and confirm I am creating an owner account for this restaurant.
              {fieldErrors.accept_terms && <span className="mt-1 block text-xs font-semibold text-red-600">{fieldErrors.accept_terms}</span>}
            </span>
          </label>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={loading}
              className="h-12 rounded-lg bg-zinc-950 px-6 text-sm font-bold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
            <p className="text-sm text-zinc-500">
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
        className={`h-12 rounded-lg border px-4 text-sm font-medium outline-none transition focus:border-amber-600 ${
          error ? "border-red-500" : "border-zinc-300"
        } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
        required
      />
      {helperText && <span className="text-xs font-medium text-zinc-500">{helperText}</span>}
      {error && <span className="text-xs font-semibold text-red-600">{error}</span>}
    </label>
  );
}
