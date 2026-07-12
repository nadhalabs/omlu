"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, registerRestaurant, staffLogin } from "@/lib/api";
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

function isStrongPassword(password: string) {
  return (
    password.length >= 10 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState<RestaurantRegistrationRequest>(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usernameValid = useMemo(
    () => /^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$/.test(form.restaurant_slug),
    [form.restaurant_slug]
  );
  const ownerUsernameValid = useMemo(
    () => /^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$/.test(form.owner_username),
    [form.owner_username]
  );
  const passwordStrong = useMemo(() => isStrongPassword(form.password), [form.password]);

  const setField = <K extends keyof RestaurantRegistrationRequest>(
    key: K,
    value: RestaurantRegistrationRequest[K]
  ) => setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!usernameValid) {
      setError("Restaurant username must use lowercase letters, numbers, hyphens, or underscores.");
      return;
    }
    if (!ownerUsernameValid) {
      setError("Personal username must use lowercase letters, numbers, hyphens, or underscores.");
      return;
    }
    if (!passwordStrong) {
      setError("Password must include uppercase, lowercase, number, and symbol.");
      return;
    }
    if (form.password !== form.confirm_password) {
      setError("Confirm password must match password.");
      return;
    }
    if (!form.accept_terms) {
      setError("Please accept the terms to continue.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        ...form,
        restaurant_slug: form.restaurant_slug.trim(),
        owner_username: form.owner_username.trim(),
      };
      const registration = await registerRestaurant(payload);
      await staffLogin({
        restaurant_slug: registration.restaurant_slug,
        login: payload.owner_username,
        password: payload.password,
      });
      router.push(registration.next_path || "/admin/setup");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Could not create the restaurant account.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-950">
      <main className="mx-auto w-full max-w-4xl">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/" className="text-sm font-black uppercase tracking-widest text-amber-700">
              Nadha Serve
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
                <TextField label="Restaurant name" value={form.restaurant_name} onChange={(value) => setField("restaurant_name", value)} />
                <TextField label="Unique restaurant username" value={form.restaurant_slug} onChange={(value) => setField("restaurant_slug", value)} placeholder="nadha-cafe" />
                <TextField label="Contact email" type="email" value={form.contact_email} onChange={(value) => setField("contact_email", value)} />
                <TextField label="Phone number" value={form.phone_number} onChange={(value) => setField("phone_number", value)} />
                <TextField label="City" value={form.city} onChange={(value) => setField("city", value)} />
              </div>
            </section>

            <section>
              <h2 className="text-lg font-black">Owner</h2>
              <div className="mt-5 grid gap-4">
                <TextField label="Owner full name" value={form.owner_full_name} onChange={(value) => setField("owner_full_name", value)} />
                <TextField label="Personal username" value={form.owner_username} onChange={(value) => setField("owner_username", value)} placeholder="anjali" />
                <TextField label="Owner email" type="email" value={form.owner_email} onChange={(value) => setField("owner_email", value)} />
                <TextField label="Password" type="password" value={form.password} onChange={(value) => setField("password", value)} />
                <TextField label="Confirm password" type="password" value={form.confirm_password} onChange={(value) => setField("confirm_password", value)} />
              </div>
            </section>
          </div>

          <label className="mt-6 flex items-start gap-3 text-sm font-semibold text-zinc-700">
            <input
              type="checkbox"
              checked={form.accept_terms}
              onChange={(e) => setField("accept_terms", e.target.checked)}
              className="mt-1 h-4 w-4 accent-zinc-950"
            />
            I accept the terms and confirm I am creating an owner account for this restaurant.
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
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-bold">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 rounded-lg border border-zinc-300 px-4 text-sm font-medium outline-none transition focus:border-amber-600"
        required
      />
    </label>
  );
}
