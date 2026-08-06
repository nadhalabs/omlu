import { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";
import { legalConfig } from "@/lib/legalConfig";

export const metadata: Metadata = {
  title: "Privacy Policy | OMLU",
  description: "Privacy Policy explaining data collection, processing, DPDP Act 2023 role allocations, and security practices for OMLU.",
};

const TOC = [
  { id: "p1", label: "1. Who Operates OMLU" },
  { id: "p2", label: "2. Scope & Regulatory Framework" },
  { id: "p3", label: "3. Context-Dependent Data Roles" },
  { id: "p4", label: "4. Categories of Data Collected" },
  { id: "p5", label: "5. Data Provided Directly" },
  { id: "p6", label: "6. Data Collected Automatically" },
  { id: "p7", label: "7. Customer Dining Data Processing" },
  { id: "p8", label: "8. Purpose of Processing" },
  { id: "p9", label: "9. Lawful Basis & Notice" },
  { id: "p10", label: "10. Security & Abuse Prevention" },
  { id: "p11", label: "11. Service Communications" },
  { id: "p12", label: "12. Data Sharing & Infrastructure" },
  { id: "p13", label: "13. Cross-Border Processing" },
  { id: "p14", label: "14. Data Retention" },
  { id: "p15", label: "15. Account Deletion & Rights" },
  { id: "p16", label: "16. Legal Exceptions" },
  { id: "p17", label: "17. Security Safeguards" },
  { id: "p18", label: "18. Breach Notification" },
  { id: "p19", label: "19. Grievance Officer Details" },
  { id: "p20", label: "20. Children's Privacy" },
  { id: "p21", label: "21. Cookies & Storage" },
  { id: "p22", label: "22. Policy Changes" },
];

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      subtitle="How Nadha Labs collects, processes, protects, and respects business and personal data under Indian privacy laws."
      activePath="/privacy"
      toc={TOC}
    >
      <div className="space-y-8 text-sm leading-relaxed text-[var(--omlu-text-primary)]">
        <section id="p1">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">1. Who Operates OMLU</h2>
          <p className="mt-2">
            This Privacy Policy applies to the OMLU restaurant software platform operated by {legalConfig.legalEntityName} (&quot;Nadha Labs&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), headquartered in India.
          </p>
        </section>

        <section id="p2">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">2. Scope and Regulatory Framework</h2>
          <p className="mt-2">
            This policy governs personal data and business information processed through the OMLU platform, customer QR ordering interfaces, staff applications, and web services. It is drafted with reference to the <strong>Digital Personal Data Protection Act, 2023 (DPDP Act)</strong>, the notified <strong>Digital Personal Data Protection Rules, 2025 (DPDP Rules)</strong>, the Information Technology Act, 2000, and applicable rules published by the Ministry of Electronics and Information Technology (MeitY).
          </p>
          <p className="mt-2">
            We distinguish between baseline statutory requirements effective upon notification and phased technical implementation timelines designated under MeitY rules.
          </p>
        </section>

        <section id="p3">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">3. Context-Dependent Data Roles (Fiduciary vs. Processor)</h2>
          <p className="mt-2 font-semibold text-amber-950 dark:text-amber-200">
            [LEGAL REVIEW REQUIRED] Under Indian privacy law, data roles depend strictly on the processing context:
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-2">
            <li>
              <strong>Customer Dining & Order Data (Processor Context):</strong> For dining guest table orders, item instructions, service calls, and bill generation, the <strong>Restaurant acts as the primary Data Fiduciary</strong> under the DPDP Act. Nadha Labs processes such customer data solely on behalf of the Restaurant as a <strong>Data Processor</strong> pursuant to commercial terms. The Restaurant is responsible for providing appropriate notices to its dining guests.
            </li>
            <li>
              <strong>Account, Staff & Security Data (Fiduciary Context):</strong> For restaurant registration, owner/staff account management, credential hashing, platform security monitoring, audit logging, rate limiting, and subscription administration, <strong>Nadha Labs acts as an independent Data Fiduciary</strong>.
            </li>
          </ul>
        </section>

        <section id="p4">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">4. Categories of Data Collected</h2>
          <p className="mt-2">
            We collect data in the following categories to provide and secure OMLU:
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li><strong>Restaurant Profile Data:</strong> Restaurant name, unique slug, contact email, phone number, city, GSTIN (if configured), order prefix, timezone.</li>
            <li><strong>Account & Credentials:</strong> Owner and staff full names, usernames, email addresses, bcrypt-hashed passwords, role permissions (`owner`, `admin`, `staff`, `kitchen`), staff PIN hashes.</li>
            <li><strong>Customer Dining Data:</strong> Session tokens, HMAC-SHA256 table participant tokens, 4-digit table join codes, customer item notes, order timestamps.</li>
            <li><strong>Financial & Bill Snapshots:</strong> Itemized orders, subtotal, CGST/SGST/IGST tax breakdowns, discount values, total bill amounts, bill numbers, receipt tokens, recorded payment method labels (`cash`, `upi`, `card`).</li>
            <li><strong>Technical & Security Metadata:</strong> IP addresses, User-Agent header data, audit logs (`AuditLog`: action, actor_user_id, target, timestamp, IP address, metadata JSON), WebPush subscription tokens.</li>
            <li><strong>Uploaded Assets:</strong> Menu image files uploaded by owners for AI menu extraction.</li>
          </ul>
        </section>

        <section id="p5">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">5. Data Provided Directly</h2>
          <p className="mt-2">
            We collect data directly provided when an Account Owner registers a profile, creates staff user credentials, configures menu items/prices/taxes, uploads menu images, or submits customer order instructions.
          </p>
        </section>

        <section id="p6">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">6. Data Collected Automatically</h2>
          <p className="mt-2">
            When users interact with OMLU, our servers automatically log technical metadata including IP address, browser type, request timestamps, WebSocket connection metrics, and rate-limiter state for security and operational diagnostics.
          </p>
        </section>

        <section id="p7">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">7. Customer Dining Data Processing</h2>
          <p className="mt-2">
            Customers browsing QR menus do not register account credentials. Dining sessions are managed via temporary session tokens and 4-digit join codes. Customer item notes and ordering activity are processed solely to communicate tickets to the kitchen display and generate the table bill.
          </p>
        </section>

        <section id="p8">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">8. Purpose of Processing</h2>
          <p className="mt-2">
            We process data exclusively for:
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>Authenticating users and isolating multi-tenant restaurant profiles.</li>
            <li>Routing orders to kitchen display screens and staff POS interfaces.</li>
            <li>Calculating bill subtotals, GST breakdowns, and issuing printable receipts.</li>
            <li>Delivering real-time WebSocket updates and browser push notifications.</li>
            <li>Processing menu image uploads via AI menu extraction.</li>
            <li>Preventing abuse, rate-limit violations, unauthorized access, and credential theft.</li>
          </ul>
        </section>

        <section id="p9">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">9. Lawful Basis and Notice</h2>
          <p className="mt-2">
            Where Nadha Labs acts as Data Fiduciary, we process personal data based on your explicit consent granted during registration and account operation, or for legitimate uses necessary to enforce system security, prevent fraud, and fulfill statutory compliance under the DPDP Act 2023.
          </p>
        </section>

        <section id="p10">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">10. Security & Abuse Prevention</h2>
          <p className="mt-2">
            We enforce HTTPS encryption for all external API endpoints, JWT token expiry, rate-limiting on sensitive endpoints (such as `/public/restaurants/register`), and tenant-isolated database constraints (`restaurant_id` foreign keys) to safeguard database integrity.
          </p>
        </section>

        <section id="p11">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">11. Service Communications</h2>
          <p className="mt-2">
            We send transactional service communications (such as password resets, operational alerts, and subscription updates) to registered contact emails. We do not sell personal data or send unsolicited third-party marketing SMS or emails.
          </p>
        </section>

        <section id="p12">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">12. Data Sharing and Infrastructure Providers</h2>
          <p className="mt-2">
            We do not sell, rent, or trade personal data. We share data only with verified cloud infrastructure processors strictly necessary to deliver the Service:
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li><strong>Vercel Inc.:</strong> Web application hosting and CDN distribution.</li>
            <li><strong>Render / Cloud Providers:</strong> Backend API infrastructure hosting.</li>
            <li><strong>Managed PostgreSQL & Redis Providers:</strong> Encrypted data storage and realtime pub/sub caching.</li>
            <li><strong>Google Gemini API (Google LLC):</strong> Image-to-JSON menu extraction processing for menu image uploads.</li>
          </ul>
        </section>

        <section id="p13">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">13. Cross-Border Processing</h2>
          <p className="mt-2">
            Cloud infrastructure hosting servers (such as Vercel CDN nodes or cloud database instances) may process encrypted data internationally in accordance with cloud security standards and applicable DPDP Act cross-border transfer rules notified by the Central Government.
          </p>
        </section>

        <section id="p14">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">14. Data Retention</h2>
          <p className="mt-2">
            We retain restaurant sales, bill, and transaction records for the duration of the active account relationship and as required by Indian fiscal and tax laws (minimum 6 years for accounting compliance). Audit logs and security records are retained for security analysis.
          </p>
        </section>

        <section id="p15">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">15. Account Deletion and Rights</h2>
          <p className="mt-2">
            Account Owners may request profile closure and data purge by contacting our Grievance Officer. Upon verification, we will delete or anonymize personal credentials, subject to statutory tax retention exceptions.
          </p>
        </section>

        <section id="p16">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">16. Legal Exceptions</h2>
          <p className="mt-2">
            We may disclose information if required by law, court order, statutory law enforcement request, legal summons, or to protect the safety, rights, and security of Nadha Labs, OMLU users, or the public.
          </p>
        </section>

        <section id="p17">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">17. Security Safeguards</h2>
          <p className="mt-2">
            We implement technical and organizational measures including AES-GCM encryption for sensitive keys, salted password hashing, and strict CORS policies. While we adhere to industry standards, no internet transmission is 100% secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section id="p18">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">18. Breach Notification</h2>
          <p className="mt-2">
            In the event of a verified personal data breach affecting your information, Nadha Labs will notify affected Data Fiduciaries / users and the Data Protection Board of India in accordance with requirements under the DPDP Act 2023 and DPDP Rules 2025.
          </p>
        </section>

        <section id="p19">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">19. Grievance Officer Details</h2>
          <p className="mt-2">
            In accordance with the DPDP Act 2023 and Information Technology rules, you may contact our designated Grievance Officer for privacy concerns or data rights requests:
          </p>
          <div className="mt-2 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-4 font-mono text-xs space-y-1">
            <p><strong>Grievance Officer:</strong> {legalConfig.grievanceOfficerName}</p>
            <p><strong>Entity:</strong> {legalConfig.legalEntityName}</p>
            <p><strong>Email:</strong> {legalConfig.privacyEmail}</p>
            <p><strong>Address:</strong> {legalConfig.registeredAddress}</p>
            <p><strong>Response Time:</strong> Within 15 days of receiving valid written notice.</p>
          </div>
        </section>

        <section id="p20">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">20. Children&apos;s Privacy</h2>
          <p className="mt-2">
            OMLU is designed strictly for commercial restaurant operational management and adult restaurant guests. We do not knowingly target or collect personal data from individuals under 18 years of age.
          </p>
        </section>

        <section id="p21">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">21. Cookies and Local Storage</h2>
          <p className="mt-2">
            OMLU uses functional browser local storage and session storage (such as theme preferences, session tokens, and order draft keys) strictly necessary for navigation, authentication, and offline draft recovery. We do not use third-party tracking cookies for targeted behavioral advertising.
          </p>
        </section>

        <section id="p22">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">22. Policy Changes</h2>
          <p className="mt-2">
            We may update this Privacy Policy periodically. Modifications will be posted on this route with an updated effective date. Continued access after updates constitutes acknowledgement of the updated Privacy Policy.
          </p>
        </section>
      </div>
    </LegalLayout>
  );
}
