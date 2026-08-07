import { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";
import { legalConfig } from "@/lib/legalConfig";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy | OMLU",
  description: "Commercial refund and subscription cancellation policy for OMLU restaurant software provided by Nadha Labs.",
};

const TOC = [
  { id: "r1", label: "1. Overview" },
  { id: "r2", label: "2. Free Pilot & Subscription Plans" },
  { id: "r3", label: "3. Subscription Cancellation Request" },
  { id: "r4", label: "4. Cancellation Effective Time & Access" },
  { id: "r5", label: "5. Refund Treatment for Paid Plans" },
  { id: "r6", label: "6. Duplicate or Erroneous Charges" },
  { id: "r7", label: "7. Prolonged Service Failure" },
  { id: "r8", label: "8. Hardware and Third-Party Costs" },
  { id: "r9", label: "9. Non-Excludable Statutory Rights" },
  { id: "r10", label: "10. Contact for Refund Requests" },
];

export default function RefundsPage() {
  return (
    <LegalLayout
      title="Refund and Cancellation Policy"
      subtitle="Clear, fair rules regarding subscription cancellations, paid plan billing, and refund treatment for OMLU."
      activePath="/refunds"
      toc={TOC}
    >
      <div className="space-y-8 text-sm leading-relaxed text-[var(--omlu-text-primary)]">
        <section id="r1">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">1. Overview</h2>
          <p className="mt-2">
            This Refund and Cancellation Policy applies to paid software subscription plans, pilot features, and commercial services provided by {legalConfig.legalEntityName} (&quot;Nadha Labs&quot;) for the OMLU restaurant operations platform.
          </p>
        </section>

        <section id="r2">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">2. Free Pilot and Subscription Plans</h2>
          <p className="mt-2">
            OMLU self-registration currently provides pilot access under our free pilot tier (`free_pilot`). Should Nadha Labs introduce paid subscription plans or enterprise feature tiers, commercial pricing and billing cycles will be communicated in advance.
          </p>
        </section>

        <section id="r3">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">3. Subscription Cancellation Process</h2>
          <p className="mt-2">
            Account Owners may request subscription cancellation at any time by contacting our support team at <a href={`mailto:${legalConfig.supportEmail}`} className="text-orange-600 font-bold underline">{legalConfig.supportEmail}</a> or submitting a cancellation request through the restaurant admin settings console.
          </p>
        </section>

        <section id="r4">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">4. Cancellation Effective Time and Access</h2>
          <p className="mt-2">
            Upon submitting a cancellation request, your cancellation will take effect at the end of your current active billing cycle. You will retain full access to your OMLU restaurant workspace until the conclusion of the paid billing period.
          </p>
        </section>

        <section id="r5">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">5. Refund Treatment for Paid Plans</h2>
          <p className="mt-2 font-semibold text-amber-950 dark:text-amber-200">
            [LEGAL REVIEW REQUIRED] Software subscriptions are non-refundable for partial billing periods or unused time once a billing cycle has commenced, except as explicitly provided in this policy or required by mandatory Indian consumer protection laws.
          </p>
          <p className="mt-2">
            For annual subscription plans, if a cancellation request is submitted within 14 days of initial activation, a pro-rata refund may be granted minus applicable administrative charges.
          </p>
        </section>

        <section id="r6">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">6. Duplicate or Erroneous Charges</h2>
          <p className="mt-2">
            In the event of an erroneous billing entry, duplicate payment charge, or technical billing error attributable to Nadha Labs, you must notify us within 30 days of the transaction. Verified erroneous charges will be refunded in full to your original payment source within 7 to 10 business days.
          </p>
        </section>

        <section id="r7">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">7. Prolonged Service Failure</h2>
          <p className="mt-2">
            If OMLU experiences an unscheduled cloud service outage exceeding 72 consecutive hours attributable solely to Nadha Labs&apos; core infrastructure, affected paying restaurants may request a pro-rata service credit or partial fee refund for the affected period.
          </p>
        </section>

        <section id="r8">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">8. Hardware and Third-Party Costs</h2>
          <p className="mt-2">
            Nadha Labs does not sell, warrant, or refund physical thermal printers, Windows PCs, routers, paper rolls, or local network hardware purchased from third-party vendors. Hardware compatibility remains the responsibility of the Restaurant.
          </p>
        </section>

        <section id="r9">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">9. Non-Excludable Statutory Rights</h2>
          <p className="mt-2">
            Nothing in this policy limits or excludes statutory consumer rights under the Consumer Protection Act, 2019 or Consumer Protection (E-Commerce) Rules, 2020 that cannot be lawfully waived or restricted by contract.
          </p>
        </section>

        <section id="r10">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">10. Contact for Refund & Cancellation Requests</h2>
          <p className="mt-2">
            To submit a cancellation or report a billing concern, contact:
          </p>
          <div className="mt-2 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-4 font-mono text-xs space-y-1">
            <p><strong>Support Email:</strong> {legalConfig.supportEmail}</p>
            <p><strong>Entity:</strong> {legalConfig.legalEntityName}</p>
            <p><strong>Response Time:</strong> Written acknowledgement within 48 business hours.</p>
          </div>
        </section>
      </div>
    </LegalLayout>
  );
}
