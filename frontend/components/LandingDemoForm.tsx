"use client";

import { FormEvent, useState } from "react";
import { PRICING_PLANS, type PricingPlan } from "@/lib/pricing";

const initialForm = { name: "", phone: "", restaurant_name: "", city: "", email: "", number_of_outlets: "" };

export function LandingDemoForm() {
  const [form, setForm] = useState(initialForm);
  const [selectedPlanId, setSelectedPlanId] = useState<PricingPlan["id"]>("standard");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const selectedPlan = PRICING_PLANS.find((plan) => plan.id === selectedPlanId) ?? PRICING_PLANS[1];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/sales-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          phone: `+91${form.phone.replace(/\D/g, "")}`,
          email: form.email.trim() || null,
          number_of_outlets: form.number_of_outlets ? Number(form.number_of_outlets) : null,
          selected_plan: selectedPlan.name,
          request_type: "demo",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data?.detail;
        throw new Error(typeof detail === "object" && detail?.message ? detail.message : typeof detail === "string" ? detail : "We could not save your request. Please try again.");
      }
      setSuccess(true);
      setForm(initialForm);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not save your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="demo" className="scroll-mt-24 py-2" aria-labelledby="landing-demo-title">
      <div className="grid gap-8 rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 sm:p-9 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12 lg:p-12">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Book a demo</p>
          <h2 id="landing-demo-title" className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">See how OMLU fits your restaurant.</h2>
          <p className="mt-4 leading-7 text-[var(--omlu-text-secondary)]">Tell us about your restaurant. Our onboarding team will contact you, understand your operations and help you get started with OMLU.</p>
          <p className="mt-5 text-sm font-semibold text-[var(--omlu-text-muted)]">A demo request does not create or activate a subscription.</p>
        </div>

        {success ? (
          <div role="status" className="flex min-h-96 flex-col items-center justify-center rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-page-background)] p-6 text-center">
            <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-orange-600/15 text-2xl font-black text-orange-500">✓</span>
            <h3 className="mt-5 text-2xl font-black">Request received.</h3>
            <p className="mt-3 max-w-md leading-7 text-[var(--omlu-text-secondary)]">Our onboarding team will contact you shortly to help you get started with OMLU.</p>
            <button type="button" onClick={() => setSuccess(false)} className="mt-7 min-h-12 rounded-lg border border-[var(--omlu-border-strong)] px-5 text-sm font-bold hover:border-orange-500 hover:text-orange-500">Send another request</button>
          </div>
        ) : (
          <form onSubmit={submit} className="rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-page-background)] p-5 sm:p-7">
            {error && <div role="alert" className="mb-5 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm font-semibold text-red-500">{error}</div>}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Name" required><input required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="omlu-lead-input" /></Field>
              <Field label="Phone number" required><div className="flex"><span className="inline-flex min-h-12 items-center rounded-l-lg border border-r-0 border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] px-3 text-sm font-bold">+91</span><input required aria-label="Indian phone number" inputMode="numeric" autoComplete="tel-national" pattern="[6-9][0-9]{9}" maxLength={10} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} className="omlu-lead-input rounded-l-none" /></div></Field>
              <Field label="Restaurant name" required><input required autoComplete="organization" value={form.restaurant_name} onChange={(e) => setForm({ ...form, restaurant_name: e.target.value })} className="omlu-lead-input" /></Field>
              <Field label="City" required><input required autoComplete="address-level2" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="omlu-lead-input" /></Field>
              <Field label="Email" hint="Optional"><input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="omlu-lead-input" /></Field>
              <Field label="Number of outlets" hint="Optional"><input type="number" min={1} max={1000} value={form.number_of_outlets} onChange={(e) => setForm({ ...form, number_of_outlets: e.target.value })} className="omlu-lead-input" /></Field>
              <Field label="Interested plan"><select value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value as PricingPlan["id"])} className="omlu-lead-input">{PRICING_PLANS.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></Field>
            </div>
            <button type="submit" disabled={submitting} className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-[var(--omlu-primary-action)] px-6 text-sm font-bold text-[var(--omlu-primary-action-text)] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? "Sending request…" : "Request Demo"}</button>
          </form>
        )}
      </div>
    </section>
  );
}

function Field({ label, hint, required = false, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block text-sm font-bold"><span className="mb-2 flex min-h-5 items-center justify-between gap-2"><span>{label}{required && <span className="text-orange-500"> *</span>}</span>{hint && <span className="text-xs font-medium text-[var(--omlu-text-muted)]">{hint}</span>}</span>{children}</label>;
}
