export type PricingVenue = "restaurant" | "cinema";
export type PricingPlan = { name: string; price: string; yearlyPrice?: string; yearlyEffective?: string; yearlySavings?: string; description: string; cta: string; features: { label: string; available?: boolean }[]; recommended?: boolean };
type VenuePricing = { label: string; registrationHref: string; plans: PricingPlan[] };

export const pricingByVenue: Record<PricingVenue, VenuePricing> = {
  restaurant: {
    label: "Restaurant", registrationHref: "/register?type=restaurant", plans: [
      { name: "Lite", price: "₹499", yearlyPrice: "₹4,999", yearlyEffective: "₹417", yearlySavings: "Save ₹989", description: "For small cafés and small restaurants.", cta: "Get Lite", features: [{ label: "QR ordering" }, { label: "Dine-in, takeaway & Quick Sale" }, { label: "Kitchen display" }, { label: "Billing & bill printing" }, { label: "Staff access" }, { label: "Basic reports" }, { label: "Ad-free", available: false }] },
      { name: "Standard", price: "₹999", yearlyPrice: "₹9,999", yearlyEffective: "₹833", yearlySavings: "Save ₹1,989", description: "Best for most restaurants.", cta: "Choose Standard", recommended: true, features: [{ label: "Everything in Lite" }, { label: "Ad-free" }, { label: "Advanced sales reports" }, { label: "Owner performance insights" }, { label: "PDF & Excel exports" }, { label: "GST reporting dashboard" }, { label: "Detailed history & filters" }, { label: "Priority support" }] },
      { name: "Pro", price: "₹1,999", yearlyPrice: "₹19,999", yearlyEffective: "₹1,667", yearlySavings: "Save ₹3,989", description: "For restaurants that need deeper control.", cta: "Go Pro", features: [{ label: "Everything in Standard" }, { label: "HSN/SAC reports" }, { label: "Accountant / CA exports" }, { label: "Advanced GST registers" }, { label: "Data health & audit tools" }, { label: "Assisted onboarding" }] },
      { name: "Custom", price: "Talk to us", description: "For larger or unique operational requirements.", cta: "Talk to us", features: [{ label: "Everything in Pro" }, { label: "Tailored setup" }, { label: "Custom reports & workflows" }, { label: "Migration assistance" }, { label: "Dedicated onboarding & support" }, { label: "Custom integrations where supported" }] },
    ],
  },
  cinema: {
    label: "Cinema", registrationHref: "/register?type=cinema", plans: [
      { name: "Starter", price: "₹999", yearlyPrice: "₹9,999", yearlyEffective: "₹833", yearlySavings: "Save ₹1,989", description: "For independent cinemas with up to 2 screens.", cta: "Get Starter", features: [{ label: "Up to 2 screens" }, { label: "Seat-based ordering" }, { label: "Screens & seats" }, { label: "Concession menu" }, { label: "Concession KDS" }, { label: "Customer order tracking" }, { label: "Realtime operations", available: false }] },
      { name: "Multiplex", price: "₹1,999", yearlyPrice: "₹19,999", yearlyEffective: "₹1,667", yearlySavings: "Save ₹3,989", description: "For growing cinema teams with up to 5 screens.", cta: "Choose Multiplex", recommended: true, features: [{ label: "Everything in Starter" }, { label: "Up to 5 screens" }, { label: "Cinema admin workspace" }, { label: "Realtime operations" }, { label: "Customer order tracking" }, { label: "Detailed order history" }, { label: "Priority support" }] },
      { name: "Cinema Pro", price: "₹3,999", yearlyPrice: "₹39,999", yearlyEffective: "₹3,333", yearlySavings: "Save ₹7,989", description: "For cinema operations with up to 12 screens.", cta: "Go Cinema Pro", features: [{ label: "Everything in Multiplex" }, { label: "Up to 12 screens" }, { label: "Advanced cinema operations" }, { label: "Operational reporting" }, { label: "Data exports" }, { label: "Assisted onboarding" }] },
      { name: "Custom", price: "Talk to us", description: "For larger cinema groups and tailored operations.", cta: "Talk to us", features: [{ label: "More than 12 screens" }, { label: "Everything in Cinema Pro" }, { label: "Tailored screen setup" }, { label: "Custom reports & workflows" }, { label: "Migration assistance" }, { label: "Dedicated onboarding & support" }] },
    ],
  },
};
