import { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";
import { legalConfig } from "@/lib/legalConfig";

export const metadata: Metadata = {
  title: "Acceptable Use Policy | OMLU",
  description: "Acceptable Use Policy defining permitted operational rules and prohibited security and regulatory conduct on OMLU.",
};

const TOC = [
  { id: "a1", label: "1. Purpose and Scope" },
  { id: "a2", label: "2. Prohibited Operational Conduct" },
  { id: "a3", label: "3. Prohibited Security & Technical Activity" },
  { id: "a4", label: "4. Prohibited Financial & Tax Manipulations" },
  { id: "a5", label: "5. Proportionate Enforcement Actions" },
  { id: "a6", label: "6. Legal Disclosures & Reporting" },
  { id: "a7", label: "7. Reporting Violations" },
];

export default function AcceptableUsePage() {
  return (
    <LegalLayout
      title="Acceptable Use Policy"
      subtitle="The operational and security guidelines governing every restaurant owner, staff user, and technical integration on OMLU."
      activePath="/acceptable-use"
      toc={TOC}
    >
      <div className="space-y-8 text-sm leading-relaxed text-[var(--omlu-text-primary)]">
        <section id="a1">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">1. Purpose and Scope</h2>
          <p className="mt-2">
            This Acceptable Use Policy (&quot;AUP&quot;) sets forth the mandatory operational standards for accessing OMLU, provided by {legalConfig.legalEntityName} (&quot;Nadha Labs&quot;). This policy applies to all Account Owners, Authorized Users, staff users, kitchen operators, and customer table sessions.
          </p>
        </section>

        <section id="a2">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">2. Prohibited Operational Conduct</h2>
          <p className="mt-2">
            Users agree not to use OMLU for any fraudulent, unlawful, or deceptive business activities. Prohibited operational conduct includes:
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>Operating an unlicenced or fictitious restaurant business entity.</li>
            <li>Sharing staff login credentials or PINs outside authorized restaurant employees.</li>
            <li>Impersonating another restaurant, staff user, customer, or Nadha Labs representative.</li>
            <li>Processing illegal, deceptive, or unauthorized menu items or services.</li>
            <li>Interfering with dining sessions or table QR access of another restaurant tenant.</li>
          </ul>
        </section>

        <section id="a3">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">3. Prohibited Security & Technical Activity</h2>
          <p className="mt-2">
            Users must not attempt to compromise the security, availability, or multi-tenant isolation of OMLU. Prohibited technical activities include:
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>Attacking or probing OMLU APIs, rate limiters, or server infrastructure.</li>
            <li>Injecting malware, viruses, SQL injection payloads, or cross-site scripting attacks.</li>
            <li>Scraping, crawling, or extracting platform code, database schemas, or tenant metrics without written authorization.</li>
            <li>Reverse engineering, decompiling, or attempting to derive source code from web or mobile applications.</li>
            <li>Overloading WebSocket pub/sub channels or sending malicious automated API request floods.</li>
          </ul>
        </section>

        <section id="a4">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">4. Prohibited Financial & Tax Manipulations</h2>
          <p className="mt-2">
            Restaurants are strictly prohibited from utilizing OMLU software tools to commit financial fraud or tax evasion. Prohibited financial activity includes:
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>Configuring false or deceptive GSTIN numbers, tax rates, or statutory business details.</li>
            <li>Manipulating order snapshots, bill issuance numbers, or staff audit records to evade GST liability.</li>
            <li>Falsifying counter payment records or issuing fraudulent bill receipts to customers.</li>
            <li>Violating applicable Goods and Services Tax (GST) laws or consumer protection regulations in India.</li>
          </ul>
        </section>

        <section id="a5">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">5. Proportionate Enforcement Actions</h2>
          <p className="mt-2">
            Nadha Labs reserves the right to investigate suspected violations of this policy and enforce proportionate remedial actions based on severity:
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li><strong>Written Warning:</strong> Formal notice outlining required corrective actions.</li>
            <li><strong>Staff Account Lock:</strong> Temporary revocation of specific compromised staff credentials.</li>
            <li><strong>Temporary Service Restriction:</strong> Rate-limiting or temporary feature restrictions.</li>
            <li><strong>Account Suspension:</strong> Temporary suspension of the Restaurant profile pending audit.</li>
            <li><strong>Account Termination:</strong> Permanent termination of account access and commercial contract.</li>
          </ul>
        </section>

        <section id="a6">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">6. Legal Disclosures & Reporting</h2>
          <p className="mt-2">
            Nadha Labs reserves the right to report severe illegal activity, financial fraud, tax evasion, or cybersecurity breaches to statutory law enforcement authorities, the Computer Emergency Response Team (CERT-In), tax officers, or law enforcement in India.
          </p>
        </section>

        <section id="a7">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">7. Reporting Violations</h2>
          <p className="mt-2">
            If you discover a security vulnerability or suspect an acceptable use violation, please contact our security team immediately at <a href={`mailto:${legalConfig.supportEmail}`} className="text-orange-600 font-bold underline">{legalConfig.supportEmail}</a>.
          </p>
        </section>
      </div>
    </LegalLayout>
  );
}
