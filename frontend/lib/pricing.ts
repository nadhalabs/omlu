export type PricingPlan = {
  id: "lite" | "standard" | "pro" | "custom";
  name: "Lite" | "Standard" | "Pro" | "Custom";
  description: string;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  trialDays: number | null;
  trialEligible: boolean;
  requestType: "demo" | "trial";
  cta: "Book a Demo" | "Start Free Trial";
  recommended: boolean;
  features: readonly string[];
};

/**
 * Confirmed commercial terms reused from the existing OMLU pricing page.
 * Trial eligibility and duration remain deliberately unset until business terms are approved.
 */
export const PRICING_PLANS: readonly PricingPlan[] = [
  {
    id: "lite",
    name: "Lite",
    description: "For small cafés and small restaurants.",
    monthlyPrice: 499,
    yearlyPrice: 4999,
    trialDays: null,
    trialEligible: false,
    requestType: "demo",
    cta: "Book a Demo",
    recommended: false,
    features: ["QR ordering", "Dine-in, takeaway & Quick Sale", "Kitchen display", "Billing & bill printing", "Staff access", "Basic reports"],
  },
  {
    id: "standard",
    name: "Standard",
    description: "Best for most restaurants.",
    monthlyPrice: 999,
    yearlyPrice: 9999,
    trialDays: null,
    trialEligible: false,
    requestType: "demo",
    cta: "Book a Demo",
    recommended: true,
    features: ["Everything in Lite", "Ad-free", "Advanced sales reports", "Owner performance insights", "PDF & Excel exports", "GST reporting dashboard", "Detailed history & filters", "Priority support"],
  },
  {
    id: "pro",
    name: "Pro",
    description: "For restaurants that need deeper control.",
    monthlyPrice: 1999,
    yearlyPrice: 19999,
    trialDays: null,
    trialEligible: false,
    requestType: "demo",
    cta: "Book a Demo",
    recommended: false,
    features: ["Everything in Standard", "HSN/SAC reports", "Accountant / CA exports", "Advanced GST registers", "Data health & audit tools", "Assisted onboarding"],
  },
  {
    id: "custom",
    name: "Custom",
    description: "For larger or unique operational requirements.",
    monthlyPrice: null,
    yearlyPrice: null,
    trialDays: null,
    trialEligible: false,
    requestType: "demo",
    cta: "Book a Demo",
    recommended: false,
    features: ["Everything in Pro", "Tailored setup", "Custom reports & workflows", "Migration assistance", "Dedicated onboarding & support", "Custom integrations where supported"],
  },
] as const;

export const DEFAULT_PRICING_PLAN_ID: PricingPlan["id"] = "standard";
