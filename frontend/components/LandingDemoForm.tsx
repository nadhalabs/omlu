"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { PRICING_PLANS, type PricingPlan } from "@/lib/pricing";

const initialForm = { name: "", phone: "", restaurant_name: "", city: "", email: "" };

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
    <section className="py-6 sm:py-10" aria-labelledby="landing-demo-title">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(520px,1.1fr)] lg:items-end lg:gap-12 xl:gap-20">
        <div className="flex min-w-0 flex-col lg:py-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Book a demo</p>
          <h2 id="landing-demo-title" className="mt-3 max-w-xl text-3xl font-black tracking-[-0.035em] sm:text-4xl lg:text-[2.65rem] lg:leading-[1.08]">See how OMLU fits your restaurant.</h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-[var(--omlu-text-secondary)]">Tell us about your restaurant. Our onboarding team will contact you, understand your operations and help you get started with OMLU.</p>
          <Image
            src="/omlu-cc.png"
            alt="OMLU chef helping a restaurant with onboarding"
            width={1536}
            height={1024}
            className="mx-auto mt-8 h-auto w-[min(82vw,360px)] object-contain sm:mt-10 sm:w-full sm:max-w-[460px] lg:mx-0 lg:max-w-[500px]"
            sizes="(max-width: 639px) 82vw, (max-width: 1023px) 460px, 500px"
          />
        </div>

        {success ? (
          <div id="demo" role="status" className="scroll-mt-24 flex min-h-96 w-full max-w-[600px] flex-col items-center justify-center justify-self-center rounded-2xl border border-[var(--omlu-success-border)] bg-[var(--omlu-primary-surface)] p-6 text-center shadow-[0_20px_55px_-36px_rgba(24,24,27,0.35)] sm:p-10 lg:justify-self-end">
            <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-[var(--omlu-success-background)] text-2xl font-black text-[var(--omlu-success-text)]">✓</span>
            <h3 className="mt-5 text-2xl font-black">Request received.</h3>
            <p className="mt-3 max-w-md leading-7 text-[var(--omlu-text-secondary)]">Our onboarding team will contact you shortly to help you get started with OMLU.</p>
            <button type="button" onClick={() => setSuccess(false)} className="mt-7 min-h-12 rounded-lg border border-[var(--omlu-border-strong)] px-5 text-sm font-bold hover:border-orange-500 hover:text-orange-500">Send another request</button>
          </div>
        ) : (
          <form id="demo" onSubmit={submit} className="scroll-mt-24 w-full max-w-[600px] justify-self-center rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-5 shadow-[0_20px_55px_-36px_rgba(24,24,27,0.35)] sm:p-8 lg:justify-self-end lg:p-9">
            {error && <div role="alert" className="mb-6 rounded-lg border border-[var(--omlu-destructive-border)] bg-[var(--omlu-destructive-background)] p-4 text-sm font-semibold text-[var(--omlu-destructive-text)]">{error}</div>}
            <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2">
              <Field label="Name" required><input required autoComplete="name" placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="omlu-lead-input" /></Field>
              <Field label="Phone number" required><div className="omlu-phone-input"><span aria-hidden="true" className="omlu-phone-prefix">+91</span><input required aria-label="Indian phone number" inputMode="numeric" autoComplete="tel-national" pattern="[6-9][0-9]{9}" title="Enter a valid 10-digit Indian mobile number" maxLength={10} placeholder="98765 43210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} /></div></Field>
              <Field label="Restaurant name" required><input required autoComplete="organization" placeholder="Restaurant name" value={form.restaurant_name} onChange={(e) => setForm({ ...form, restaurant_name: e.target.value })} className="omlu-lead-input" /></Field>
              <Field label="City" required><input required autoComplete="address-level2" placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="omlu-lead-input" /></Field>
              <Field label="Email" hint="Optional" className="sm:col-span-2"><input type="email" autoComplete="email" placeholder="you@restaurant.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="omlu-lead-input" /></Field>
              <Field label="Interested plan" className="sm:col-span-2"><select value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value as PricingPlan["id"])} className="omlu-lead-input">{PRICING_PLANS.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></Field>
            </div>
            <button type="submit" disabled={submitting} aria-busy={submitting} className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-[var(--omlu-primary-action)] px-6 text-sm font-black text-white shadow-sm hover:bg-[var(--omlu-accent-dark)] disabled:cursor-not-allowed disabled:opacity-60">{submitting ? "Sending request…" : "Request Demo"}</button>
          </form>
        )}
      </div>
    </section>
  );
}

function Field({ label, hint, required = false, className = "", children }: { label: string; hint?: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return <label className={`block min-w-0 text-sm font-bold ${className}`}><span className="mb-2 flex min-h-5 items-center gap-2"><span>{label}{required && <span className="text-orange-500"> *</span>}</span>{hint && <span className="text-xs font-medium text-[var(--omlu-text-muted)]">{hint}</span>}</span>{children}</label>;
}
