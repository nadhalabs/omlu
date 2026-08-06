import { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";
import { legalConfig } from "@/lib/legalConfig";

export const metadata: Metadata = {
  title: "Terms of Service | OMLU",
  description: "Terms of Service governing the use of OMLU restaurant operations software provided by Nadha Labs in India.",
};

const TOC = [
  { id: "s1", label: "1. Introduction and Acceptance" },
  { id: "s2", label: "2. Definitions" },
  { id: "s3", label: "3. Description of Current Service" },
  { id: "s4", label: "4. Eligibility and Account Authority" },
  { id: "s5", label: "5. Account Registration & Information" },
  { id: "s6", label: "6. Credentials and Staff Security" },
  { id: "s7", label: "7. Menu Data, Prices & Tax Settings" },
  { id: "s8", label: "8. Customer Orders & Table Sessions" },
  { id: "s9", label: "9. Kitchen & Staff Workflows" },
  { id: "s10", label: "10. Draft Bills vs. Issued Bills" },
  { id: "s11", label: "11. Manual Payment-Status Recording" },
  { id: "s12", label: "12. Printing & Hardware Limitations" },
  { id: "s13", label: "13. Connectivity Dependency" },
  { id: "s14", label: "14. Verification Responsibility" },
  { id: "s15", label: "15. Permitted Use" },
  { id: "s16", label: "16. Prohibited Conduct" },
  { id: "s17", label: "17. Restaurant Content" },
  { id: "s18", label: "18. Software Ownership & IP" },
  { id: "s19", label: "19. Feedback Permissions" },
  { id: "s20", label: "20. Fees, Pricing & Commercial Terms" },
  { id: "s21", label: "21. Suspension and Termination" },
  { id: "s22", label: "22. Data Access After Termination" },
  { id: "s23", label: "23. Third-Party Infrastructure" },
  { id: "s24", label: "24. Disclaimer of Warranties" },
  { id: "s25", label: "25. Limitation of Liability" },
  { id: "s26", label: "26. Indemnification" },
  { id: "s27", label: "27. Governing Law & Jurisdiction" },
  { id: "s28", label: "28. Changes to Terms" },
  { id: "s29", label: "29. Contact & Grievance Details" },
  { id: "s30", label: "30. General Provisions" },
];

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      subtitle="The binding legal agreement governing the access and use of OMLU web and mobile software services."
      activePath="/terms"
      toc={TOC}
    >
      <div className="space-y-8 text-sm leading-relaxed text-[var(--omlu-text-primary)]">
        <section id="s1">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">1. Introduction and Acceptance</h2>
          <p className="mt-2">
            These Terms of Service (&quot;Terms&quot;) constitute a legally binding agreement between {legalConfig.legalEntityName} (&quot;Nadha Labs&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) and the restaurant business entity, owner, or authorized representative (&quot;Restaurant&quot;, &quot;you&quot;, or &quot;Account Owner&quot;) accessing or using the OMLU restaurant operations platform (&quot;OMLU&quot; or the &quot;Service&quot;).
          </p>
          <p className="mt-2">
            By creating an account, registering a restaurant profile, clicking any checkbox confirming acceptance, or accessing the Service, you confirm that you have read, understood, and agree to be bound by these Terms, our <a href="/privacy" className="text-orange-600 font-bold underline">Privacy Policy</a>, <a href="/refunds" className="text-orange-600 font-bold underline">Refund and Cancellation Policy</a>, <a href="/acceptable-use" className="text-orange-600 font-bold underline">Acceptable Use Policy</a>, and <a href="/service-policy" className="text-orange-600 font-bold underline">Service Availability, Printing and Support Policy</a>. If you do not agree, you must not access or use OMLU.
          </p>
        </section>

        <section id="s2">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">2. Definitions</h2>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li><strong>&quot;Account Owner&quot;:</strong> The individual who registers the primary restaurant profile on OMLU.</li>
            <li><strong>&quot;Authorized User&quot;:</strong> Any staff member, manager, kitchen technician, or administrator granted credentials by the Account Owner.</li>
            <li><strong>&quot;Customer&quot;:</strong> A dining guest at a Restaurant who scans a QR code to view menus, place orders, or request table assistance.</li>
            <li><strong>&quot;Draft Bill&quot;:</strong> A preliminary pre-billing summary requested during a dining session prior to official bill generation.</li>
            <li><strong>&quot;Issued Bill&quot;:</strong> An official bill snapshot generated under Owner or Admin authority with assigned bill number and receipt access token.</li>
            <li><strong>&quot;Service&quot;:</strong> The OMLU multi-tenant cloud software, web applications, staff portals, customer QR interfaces, and associated tools provided by Nadha Labs.</li>
          </ul>
        </section>

        <section id="s3">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">3. Description of the Current Service</h2>
          <p className="mt-2">
            OMLU is a cloud-based restaurant operations SaaS product providing self-service restaurant onboarding, multi-role staff account management (Owner, Admin, Staff, Kitchen), public QR customer menus, table join-code session ordering, staff order entry, kitchen display ticket tracking, table service requests, GST-aware bill calculations, manual payment-status recording, and local thermal printer routing.
          </p>
          <p className="mt-2">
            OMLU does not currently process online financial payments, process customer credit/debit cards, interface with third-party payment gateways, settle commercial funds, sync with Swiggy/Zomato, sync with Bluetooth thermal printers, or operate full offline database synchronization.
          </p>
        </section>

        <section id="s4">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">4. Eligibility and Authority</h2>
          <p className="mt-2">
            You represent and warrant that you are at least 18 years of age and hold full legal authority to bind the Restaurant business to these Terms. If registering on behalf of a partnership, firm, or company, you confirm that you possess all necessary statutory and corporate authorizations.
          </p>
        </section>

        <section id="s5">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">5. Account Registration and Accurate Information</h2>
          <p className="mt-2">
            You agree to provide accurate, current, and complete information during registration, including your full legal name, business contact email, phone number, city, and restaurant profile details. You agree to maintain and update this information promptly. Providing false or misleading information constitutes a material breach of these Terms.
          </p>
        </section>

        <section id="s6">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">6. Credential Security and Staff Accounts</h2>
          <p className="mt-2">
            The Account Owner is strictly responsible for managing staff account credentials, setting appropriate access roles (Owner, Admin, Staff, Kitchen), and safeguarding login credentials and PINs. Nadha Labs is not liable for unauthorized access or operational errors arising from credential sharing or poor password security within your restaurant team.
          </p>
        </section>

        <section id="s7">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">7. Restaurant Responsibility for Menu Data, Prices, and Taxes</h2>
          <p className="mt-2 font-semibold text-amber-950 dark:text-amber-200">
            [LEGAL REVIEW REQUIRED] The Restaurant retains sole responsibility for configuring item names, descriptions, prices, option variants, addon charges, GST rates, tax inclusive/exclusive modes, and invoice prefixes.
          </p>
          <p className="mt-2">
            Nadha Labs provides configurable software calculators. The Restaurant must verify that all GST rates, invoice particulars, and calculations comply strictly with the Central Goods and Services Tax Act, 2017, applicable State GST Acts, and rules published by CBIC. Nadha Labs is not a tax, accounting, or legal adviser.
          </p>
        </section>

        <section id="s8">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">8. Customer Orders and Table Sessions</h2>
          <p className="mt-2">
            Customer QR scanning allows table guests to browse menus and initiate or join dining sessions via a 4-digit table join code. Customers may place multiple ordering rounds. The Restaurant is responsible for verifying table guest identity, order validity, and served items prior to preparation or bill issuance.
          </p>
        </section>

        <section id="s9">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">9. Kitchen and Staff Workflows</h2>
          <p className="mt-2">
            Orders submitted through QR menus or staff POS interfaces appear on the Kitchen Display System (KDS) and staff management tools. Staff users are responsible for monitoring order tickets, managing item availability, and resolving table service requests in real time.
          </p>
        </section>

        <section id="s10">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">10. Draft Bills versus Officially Issued Bills</h2>
          <p className="mt-2">
            A Draft Bill is an uncommitted summary of dining session items. An Issued Bill is an official fiscal document generated under Owner or Admin control with a unique bill number and public receipt token. Once a bill is officially issued, table ordering for that session is locked unless explicitly reopened by authorized staff.
          </p>
        </section>

        <section id="s11">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">11. Payment-Status Recording</h2>
          <p className="mt-2">
            OMLU allows authorized staff to manually record payment method labels (such as Cash or UPI) and payment status for an issued bill or quick sale. Recording a payment status within OMLU is an internal administrative record-keeping entry only and does not constitute financial clearing, bank settlement, or payment processing by Nadha Labs.
          </p>
        </section>

        <section id="s12">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">12. Printing and Hardware Limitations</h2>
          <p className="mt-2">
            OMLU supports web browser printing and local LAN/TCP thermal printing via the OMLU Windows Print Bridge tool. Thermal printing requires compatible network hardware, proper local IP configuration, correct paper width settings, and active local network connectivity. Hardware jams, driver failures, or local network disruptions do not invalidate an already issued bill.
          </p>
        </section>

        <section id="s13">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">13. Internet and Connectivity Dependency</h2>
          <p className="mt-2">
            OMLU is a cloud service requiring active internet access. Offline ordering and offline database operations are not supported. The Restaurant is responsible for securing reliable broadband and secondary mobile-data fallbacks for its operational premises.
          </p>
        </section>

        <section id="s14">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">14. Restaurant Responsibility to Verify Bills and Payments</h2>
          <p className="mt-2">
            The Restaurant must independently verify item counts, applied discounts, GST amounts, printed receipts, and physical cash/UPI receipt prior to releasing table guests or closing table sessions. Nadha Labs is not liable for uncollected guest bills or erroneous billing configurations.
          </p>
        </section>

        <section id="s15">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">15. Permitted Use</h2>
          <p className="mt-2">
            You are granted a limited, non-exclusive, non-transferable, revocable license to access and use OMLU solely for legitimate restaurant dining operations in accordance with these Terms and applicable Indian laws.
          </p>
        </section>

        <section id="s16">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">16. Prohibited Conduct</h2>
          <p className="mt-2">
            You agree not to engage in any unauthorized access, reverse engineering, vulnerability probing, credential sharing outside staff, malicious automated scraping, false GST representation, fraudulent bill manipulation, or unlawful processing of personal data.
          </p>
        </section>

        <section id="s17">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">17. Restaurant Content and Data Licence</h2>
          <p className="mt-2">
            The Restaurant retains ownership of its menu data, logos, pricing, and business metrics. You grant Nadha Labs a worldwide, non-exclusive, royalty-free licence to host, process, reproduce, and display your content solely as required to provide, maintain, and secure the Service.
          </p>
        </section>

        <section id="s18">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">18. Ownership of OMLU Software and Branding</h2>
          <p className="mt-2">
            All rights, title, and interest in and to the OMLU software, source code, database structures, user interface designs, logos, trademarks, and documentation belong exclusively to {legalConfig.legalEntityName}.
          </p>
        </section>

        <section id="s19">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">19. Feedback Permissions</h2>
          <p className="mt-2">
            If you provide suggestions, feature requests, or operational feedback to Nadha Labs, we may use and incorporate such feedback without restriction or financial obligation to you.
          </p>
        </section>

        <section id="s20">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">20. Fees, Pricing, and Commercial Terms</h2>
          <p className="mt-2">
            OMLU pricing plans, pilot access terms, and feature inclusions are displayed on our official portals or defined in written commercial agreements. Nadha Labs reserves the right to modify prospective subscription fees upon 30 days&apos; advance notice. Specific written enterprise contracts shall override public pricing where explicitly agreed.
          </p>
        </section>

        <section id="s21">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">21. Suspension and Termination</h2>
          <p className="mt-2">
            Nadha Labs may suspend or terminate your access immediately if you violate these Terms, breach acceptable use rules, fail to pay applicable fees, or engage in activity threatening system security or tenant isolation.
          </p>
        </section>

        <section id="s22">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">22. Data Access and Export Following Termination</h2>
          <p className="mt-2">
            Upon termination, your right to access OMLU ceases. Upon written request submitted within 30 days of account termination, Nadha Labs will provide a standard export of historical sales and bill records, subject to statutory data retention exceptions.
          </p>
        </section>

        <section id="s23">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">23. Third-Party Infrastructure</h2>
          <p className="mt-2">
            OMLU relies on third-party cloud infrastructure providers (including Vercel, Render, PostgreSQL database providers, Redis cloud providers, and Google Gemini API for menu extraction). Nadha Labs is not liable for service interruptions caused by third-party infrastructure outages.
          </p>
        </section>

        <section id="s24">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">24. Disclaimer of Warranties</h2>
          <p className="mt-2 font-semibold text-amber-950 dark:text-amber-200">
            OMLU IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. WE DO NOT WARRANT THAT OMLU WILL BE UNINTERRUPTED, 100% UPTIME ERROR-FREE, OR FULLY IMMUNE TO DATA LOSS.
          </p>
        </section>

        <section id="s25">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">25. Limitation of Liability</h2>
          <p className="mt-2 font-semibold text-amber-950 dark:text-amber-200">
            [LEGAL REVIEW REQUIRED] TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE INDIAN LAWS, NADHA LABS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, OR PUNITIVE DAMAGES, LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR BUSINESS INTERRUPTION ARISING OUT OF OR RELATING TO THE SERVICE.
          </p>
          <p className="mt-2 font-semibold text-amber-950 dark:text-amber-200">
            [LEGAL REVIEW REQUIRED] NADHA LABS&apos; TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS ARISING UNDER OR IN CONNECTION WITH THESE TERMS SHALL BE LIMITED TO THE TOTAL FEES PAID BY THE RESTAURANT TO NADHA LABS IN THE THREE (3) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO LIABILITY.
          </p>
        </section>

        <section id="s26">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">26. Indemnification</h2>
          <p className="mt-2">
            The Restaurant agrees to indemnify, defend, and hold harmless Nadha Labs, its founders, officers, and contractors against any claims, losses, damages, liabilities, or legal fees resulting from your violation of these Terms, non-compliance with GST laws, or unlawful processing of guest personal data.
          </p>
        </section>

        <section id="s27">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">27. Governing Law and Jurisdiction</h2>
          <p className="mt-2">
            These Terms are governed by and construed in accordance with the laws of India, including the Indian Contract Act, 1872, Information Technology Act, 2000, and Consumer Protection Act, 2019. Any disputes shall be subject to the exclusive jurisdiction of the competent courts in {legalConfig.jurisdictionCityState}.
          </p>
        </section>

        <section id="s28">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">28. Changes to Terms</h2>
          <p className="mt-2">
            We may update these Terms from time to time. Material modifications will be notified via our portal or official business email. Continued use of OMLU following published revisions constitutes acceptance of the modified Terms.
          </p>
        </section>

        <section id="s29">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">29. Contact and Grievance Details</h2>
          <p className="mt-2">
            For operational support or legal inquiries, please contact:
          </p>
          <div className="mt-2 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-4 font-mono text-xs space-y-1">
            <p><strong>Entity:</strong> {legalConfig.legalEntityName}</p>
            <p><strong>Support Email:</strong> {legalConfig.supportEmail}</p>
            <p><strong>Privacy Email:</strong> {legalConfig.privacyEmail}</p>
            <p><strong>Address:</strong> {legalConfig.registeredAddress}</p>
            <p><strong>Jurisdiction:</strong> {legalConfig.jurisdictionCityState}</p>
          </div>
        </section>

        <section id="s30">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">30. General Provisions</h2>
          <p className="mt-2">
            If any provision of these Terms is found invalid or unenforceable, the remaining provisions shall remain in full force and effect. No waiver of any breach shall constitute a waiver of any subsequent breach. These Terms constitute the entire agreement between Nadha Labs and the Restaurant regarding OMLU.
          </p>
        </section>
      </div>
    </LegalLayout>
  );
}
