import { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";
import { legalConfig } from "@/lib/legalConfig";

export const metadata: Metadata = {
  title: "Service Availability, Printing & Support Policy | OMLU",
  description: "Detailed operational guidelines regarding cloud service requirements, thermal printing mechanics, internet fallbacks, and support channels for OMLU.",
};

const TOC = [
  { id: "s1", label: "1. Cloud Service & Internet Requirement" },
  { id: "s2", label: "2. Maintenance Windows & Service Changes" },
  { id: "s3", label: "3. Mobile Data Fallback Recommendation" },
  { id: "s4", label: "4. Web Browser Printing Mechanics" },
  { id: "s5", label: "5. LAN/TCP Thermal Printing & Windows Print Bridge" },
  { id: "s6", label: "6. Device-Local Printer Setup" },
  { id: "s7", label: "7. Hardware Compatibility Disclaimer" },
  { id: "s8", label: "8. Restaurant Infrastructure Responsibility" },
  { id: "s9", label: "9. Print Failure & Issued Bill Integrity" },
  { id: "s10", label: "10. Manual Operational Fallback" },
  { id: "s11", label: "11. Data Consistency & Retry Behavior" },
  { id: "s12", label: "12. Support Channels & Hours" },
  { id: "s13", label: "13. Incident Communication" },
  { id: "s14", label: "14. Beta Features & Experimental Modules" },
];

export default function ServicePolicyPage() {
  return (
    <LegalLayout
      title="Service Availability, Printing and Support Policy"
      subtitle="Operational guidelines governing cloud uptime, internet dependency, thermal printer setup, and technical support standards."
      activePath="/service-policy"
      toc={TOC}
    >
      <div className="space-y-8 text-sm leading-relaxed text-[var(--omlu-text-primary)]">
        <section id="s1">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">1. Cloud-Service & Internet Requirement</h2>
          <div className="mt-2 rounded-xl border border-orange-200 bg-orange-50 dark:border-orange-900/60 dark:bg-orange-950/30 p-4 text-orange-950 dark:text-orange-200 font-semibold">
            OMLU is designed as an online cloud service. Internet access is generally required for ordering, kitchen updates, bill issuance, payment recording and account administration.
          </div>
          <p className="mt-3">
            OMLU relies on real-time API communication and WebSocket event synchronization. Full offline database synchronization and offline bill generation are not currently supported.
          </p>
        </section>

        <section id="s2">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">2. Maintenance Windows & Service Changes</h2>
          <p className="mt-2">
            Nadha Labs performs routine maintenance, security patches, and application deployments to ensure optimal platform performance. Scheduled maintenance is conducted during low-traffic periods where feasible, with advance notice posted on administrative portals. Emergency security updates may occur without prior notice.
          </p>
        </section>

        <section id="s3">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">3. Mobile-Data / Hotspot Fallback Recommendation</h2>
          <p className="mt-2">
            Because restaurant dining operations rely on active network connectivity, Nadha Labs strongly recommends that every Restaurant maintain a backup mobile-data connection or secondary cellular Wi-Fi hotspot to prevent ordering downtime during primary ISP outages.
          </p>
        </section>

        <section id="s4">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">4. Browser Printing Behaviour</h2>
          <p className="mt-2">
            OMLU includes standard same-origin browser printing support. When printing receipts via web browsers (e.g. Google Chrome or Mozilla Firefox), the print preview and physical output depend on local operating system drivers, page margin settings, and browser print dialog configurations.
          </p>
        </section>

        <section id="s5">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">5. LAN/TCP Thermal Printing & Windows Print Bridge</h2>
          <p className="mt-2">
            For direct kitchen and counter thermal printing, OMLU provides the Windows OMLU Print Bridge background tool. The Print Bridge runs locally on a restaurant Windows PC (port 24242) and routes raw ESC/POS command payloads directly over local TCP/IP sockets to compatible network thermal printers.
          </p>
        </section>

        <section id="s6">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">6. Device-Local Printer Setup</h2>
          <p className="mt-2">
            Thermal printers must be assigned a static IPv4 address within the restaurant local area network (LAN). The Restaurant must configure matching printer IP addresses and paper widths (58mm or 80mm) within the OMLU settings portal.
          </p>
        </section>

        <section id="s7">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">7. Hardware Compatibility Disclaimer</h2>
          <p className="mt-2">
            Nadha Labs does not guarantee that every thermal printer model, USB print adapter, or legacy serial printer will be compatible with OMLU. Printing features are tested and supported strictly for standard ESC/POS-compatible LAN/TCP thermal printers. Bluetooth thermal printing is not currently supported.
          </p>
        </section>

        <section id="s8">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">8. Restaurant Responsibility for Infrastructure</h2>
          <p className="mt-2">
            The Restaurant is strictly responsible for procuring, maintaining, and troubleshooting its physical operational hardware, including:
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>Local Wi-Fi routers, LAN switches, and network cabling.</li>
            <li>Uninterrupted power supplies (UPS) for routers, PCs, and thermal printers.</li>
            <li>Thermal paper roll replacement and hardware maintenance.</li>
            <li>Local PC operating system updates and network firewall exceptions.</li>
          </ul>
        </section>

        <section id="s9">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">9. Print Failure and Issued Bill Integrity</h2>
          <div className="mt-2 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-4 text-xs font-semibold">
            A printed output is only as accurate as the restaurant data, prices, tax settings and bill information supplied or confirmed by the Restaurant.
          </div>
          <p className="mt-3">
            If a thermal receipt fails to print due to paper exhaustion, local network loss, or printer power failure, the bill record remains valid and officially recorded in the database. Staff should verify bill status in the administrative portal and trigger a reprint once hardware is restored.
          </p>
        </section>

        <section id="s10">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">10. Manual Operational Fallback Recommendation</h2>
          <p className="mt-2">
            During prolonged ISP or local network outages, staff should utilize manual pad-and-paper ordering and request counter settlement upon internet restoration.
          </p>
        </section>

        <section id="s11">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">11. Data Consistency & Safe Retry Behaviour</h2>
          <p className="mt-2">
            OMLU implements idempotency keys and transactional guards for order creation and payment recording. In the event of a temporary network drop during submission, staff should refresh the portal status before re-submitting to prevent duplicate orders.
          </p>
        </section>

        <section id="s12">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">12. Support Channels & Expected Hours</h2>
          <p className="mt-2">
            Technical support is provided via email at <a href={`mailto:${legalConfig.supportEmail}`} className="text-orange-600 font-bold underline">{legalConfig.supportEmail}</a>. Support is monitored Monday through Saturday, from 9:00 AM to 8:00 PM IST.
          </p>
        </section>

        <section id="s13">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">13. Incident Communication</h2>
          <p className="mt-2">
            Platform service incidents or cloud infrastructure outages are communicated via administrative portal notices or official email broadcasts.
          </p>
        </section>

        <section id="s14">
          <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">14. Beta Features & Experimental Modules</h2>
          <p className="mt-2">
            Modules designated as &quot;Beta&quot;, &quot;Preview&quot;, or &quot;Experimental&quot; are provided for testing purposes without service level warranties.
          </p>
        </section>
      </div>
    </LegalLayout>
  );
}
