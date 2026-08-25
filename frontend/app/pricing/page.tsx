import type { Metadata } from "next";
import Link from "next/link";
import { LandingThemeToggle } from "@/components/LandingThemeToggle";
import styles from "./pricing.module.css";

const description =
  "Simple OMLU plans for restaurants, with QR ordering, kitchen operations, billing, reporting and more.";

export const metadata: Metadata = {
  title: "Pricing | OMLU",
  description,
  alternates: { canonical: "https://omlu.in/pricing" },
  openGraph: {
    title: "Pricing | OMLU",
    description,
    type: "website",
    url: "https://omlu.in/pricing",
  },
};

type Plan = {
  name: string;
  price: string;
  yearlyPrice?: string;
  yearlyEffective?: string;
  yearlySavings?: string;
  description: string;
  cta: string;
  features: { label: string; available?: boolean }[];
  recommended?: boolean;
};

const plans: Plan[] = [
  {
    name: "Lite",
    price: "₹499",
    yearlyPrice: "₹4,999",
    yearlyEffective: "₹417",
    yearlySavings: "Save ₹989",
    description: "For small cafés and small restaurants.",
    cta: "Get Lite",
    features: [
      { label: "QR ordering" },
      { label: "Dine-in, takeaway & Quick Sale" },
      { label: "Kitchen display" },
      { label: "Billing & bill printing" },
      { label: "Staff access" },
      { label: "Basic reports" },
      { label: "Ad-free", available: false },
    ],
  },
  {
    name: "Standard",
    price: "₹999",
    yearlyPrice: "₹9,999",
    yearlyEffective: "₹833",
    yearlySavings: "Save ₹1,989",
    description: "Best for most restaurants.",
    cta: "Choose Standard",
    recommended: true,
    features: [
      { label: "Everything in Lite" },
      { label: "Ad-free" },
      { label: "Advanced sales reports" },
      { label: "Owner performance insights" },
      { label: "PDF & Excel exports" },
      { label: "GST reporting dashboard" },
      { label: "Detailed history & filters" },
      { label: "Priority support" },
    ],
  },
  {
    name: "Pro",
    price: "₹1,999",
    yearlyPrice: "₹19,999",
    yearlyEffective: "₹1,667",
    yearlySavings: "Save ₹3,989",
    description: "For restaurants that need deeper control.",
    cta: "Go Pro",
    features: [
      { label: "Everything in Standard" },
      { label: "HSN/SAC reports" },
      { label: "Accountant / CA exports" },
      { label: "Advanced GST registers" },
      { label: "Data health & audit tools" },
      { label: "Assisted onboarding" },
    ],
  },
  {
    name: "Custom",
    price: "Talk to us",
    description: "For larger or unique operational requirements.",
    cta: "Talk to us",
    features: [
      { label: "Everything in Pro" },
      { label: "Tailored setup" },
      { label: "Custom reports & workflows" },
      { label: "Migration assistance" },
      { label: "Dedicated onboarding & support" },
      { label: "Custom integrations where supported" },
    ],
  },
];

export default function PricingPage() {
  return (
    <div className={styles.page}>
      <div className={styles.glowOne} aria-hidden="true" />
      <div className={styles.glowTwo} aria-hidden="true" />
      <div className={styles.surface}>
        <header className={styles.header}>
          <Link href="/" className={styles.wordmark} aria-label="OMLU Home">OMLU</Link>
          <nav className={styles.nav} aria-label="Public navigation">
            <Link href="/">Home</Link>
            <Link href="/faq">FAQ</Link>
            <span aria-current="page">Pricing</span>
            <Link href="/login">Sign In</Link>
          </nav>
          <div className={styles.headerActions}>
            <Link href="/register" className={`omlu-button omlu-button--compact ${styles.register}`}>Create Restaurant <span aria-hidden="true">→</span></Link>
            <LandingThemeToggle />
          </div>
        </header>

        <main>
          <section className={styles.hero} aria-labelledby="pricing-title">
            <h1 id="pricing-title">Choose the plan that’s right<br className={styles.desktopBreak} /> <span>for your restaurant</span></h1>
          </section>

          <div className={styles.billingRegion}>
            <div className={styles.billingControls}>
              <fieldset className={styles.billingToggle}>
                <legend className={styles.srOnly}>Billing period</legend>
                <span className={styles.billingSegment}>
                  <input id="billing-monthly" name="billing-period" type="radio" defaultChecked />
                  <label htmlFor="billing-monthly">Monthly</label>
                </span>
                <span className={styles.billingSegment}>
                  <input id="billing-yearly" name="billing-period" type="radio" />
                  <label htmlFor="billing-yearly">Yearly</label>
                </span>
              </fieldset>
              <span className={styles.offerBadge}>2 months free</span>
            </div>

            <section className={styles.grid} aria-label="OMLU pricing plans">
              {plans.map((plan) => (
                <article key={plan.name} className={`${styles.card} ${plan.recommended ? styles.recommended : ""}`}>
                {plan.recommended && <div className={styles.badge}><span aria-hidden="true">◆</span> Best Value</div>}
                <div className={styles.cardBody}>
                  <p className={styles.planName}>{plan.name}</p>
                  <div className={styles.priceBlock} aria-live="polite">
                    <div className={`${styles.monthlyPrice} ${plan.name === "Custom" ? styles.customPrice : ""}`}>
                      <span className={styles.price}>{plan.price}{plan.name !== "Custom" && <span>/month</span>}</span>
                    </div>
                    <div className={`${styles.yearlyPrice} ${plan.name === "Custom" ? styles.customPrice : ""}`}>
                      <span className={styles.price}>{plan.yearlyEffective ?? plan.price}{plan.name !== "Custom" && <span>/month</span>}</span>
                      {plan.yearlyPrice && <span className={styles.annualPrice}>{plan.yearlyPrice} billed annually</span>}
                      {plan.yearlySavings && <span className={styles.savings}>{plan.yearlySavings}</span>}
                    </div>
                  </div>
                  <p className={styles.description}>{plan.description}</p>
                  <button type="button" className={`omlu-button ${styles.cta}`}>{plan.cta} <span aria-hidden="true">→</span></button>
                  <ul className={styles.features}>
                    {plan.features.map((feature) => {
                      const available = feature.available !== false;
                      return (
                        <li key={feature.label} className={available ? "" : styles.unavailable}>
                          <span className={styles.featureIcon} aria-hidden="true">{available ? "✓" : "×"}</span>
                          <span>{feature.label}{!available && <span className={styles.srOnly}> — not included</span>}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                </article>
              ))}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
