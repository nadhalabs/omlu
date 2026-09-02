"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LandingThemeToggle } from "@/components/LandingThemeToggle";
import { pricingByVenue, type PricingPlan, type PricingVenue } from "./pricingData";
import styles from "./pricing.module.css";

export default function PricingClient() {
  const requestedType = useSearchParams().get("type");
  const venue: PricingVenue = requestedType === "cinema" ? "cinema" : "restaurant";
  const pricing = pricingByVenue[venue];
  return <div className={styles.page}>
    <div className={styles.glowOne} aria-hidden="true" /><div className={styles.glowTwo} aria-hidden="true" />
    <div className={styles.surface}>
      <header className={styles.header}>
        <Link href="/" className={styles.wordmark} aria-label="OMLU Home">OMLU</Link>
        <nav className={styles.nav} aria-label="Public navigation"><Link href="/">Home</Link><Link href="/restaurants">Restaurants</Link><Link href="/cinemas">Cinemas</Link><span aria-current="page">Pricing</span><Link href="/login">Sign In</Link></nav>
        <div className={styles.headerActions}><Link href={pricing.registrationHref} className={styles.register}>Get Started <span aria-hidden="true">→</span></Link><LandingThemeToggle /></div>
      </header>
      <main>
        <section className={styles.hero} aria-labelledby="pricing-title"><h1 id="pricing-title">Choose the plan that’s right<br className={styles.desktopBreak} /> <span>for your {pricing.label.toLowerCase()}</span></h1></section>
        <nav className={styles.venueToggle} aria-label="Choose venue pricing"><Link href="/pricing?type=restaurant" aria-current={venue === "restaurant" ? "page" : undefined}>Restaurants</Link><Link href="/pricing?type=cinema" aria-current={venue === "cinema" ? "page" : undefined}>Cinemas</Link></nav>
        <div key={venue} className={styles.billingRegion}>
          <div className={styles.billingControls}><fieldset className={styles.billingToggle}><legend className={styles.srOnly}>Billing period</legend><span className={styles.billingSegment}><input id="billing-monthly" name="billing-period" type="radio" defaultChecked /><label htmlFor="billing-monthly">Monthly</label></span><span className={styles.billingSegment}><input id="billing-yearly" name="billing-period" type="radio" /><label htmlFor="billing-yearly">Yearly</label></span></fieldset><span className={styles.offerBadge}>2 months free</span></div>
          <section className={styles.grid} aria-label={`OMLU ${pricing.label} pricing plans`}>{pricing.plans.map((plan) => <PricingCard key={plan.name} plan={plan} registrationHref={pricing.registrationHref} />)}</section>
        </div>
      </main>
    </div>
  </div>;
}

function PricingCard({ plan, registrationHref }: { plan: PricingPlan; registrationHref: string }) {
  const isCustom = plan.name === "Custom";
  return <article className={`${styles.card} ${plan.recommended ? styles.recommended : ""}`}>
    {plan.recommended && <div className={styles.badge}><span aria-hidden="true">◆</span> Best Value</div>}
    <div className={styles.cardBody}><p className={styles.planName}>{plan.name}</p><div className={styles.priceBlock} aria-live="polite"><div className={`${styles.monthlyPrice} ${isCustom ? styles.customPrice : ""}`}><span className={styles.price}>{plan.price}{!isCustom && <span>/month</span>}</span></div><div className={`${styles.yearlyPrice} ${isCustom ? styles.customPrice : ""}`}><span className={styles.price}>{plan.yearlyEffective ?? plan.price}{!isCustom && <span>/month</span>}</span>{plan.yearlyPrice && <span className={styles.annualPrice}>{plan.yearlyPrice} billed annually</span>}{plan.yearlySavings && <span className={styles.savings}>{plan.yearlySavings}</span>}</div></div><p className={styles.description}>{plan.description}</p><Link href={registrationHref} className={styles.cta}>{plan.cta} <span aria-hidden="true">→</span></Link><ul className={styles.features}>{plan.features.map((feature) => { const available = feature.available !== false; return <li key={feature.label} className={available ? "" : styles.unavailable}><span className={styles.featureIcon} aria-hidden="true">{available ? "✓" : "×"}</span><span>{feature.label}{!available && <span className={styles.srOnly}> — not included</span>}</span></li>; })}</ul></div>
  </article>;
}
