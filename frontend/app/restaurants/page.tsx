import type { Metadata } from "next";
import { VenueProductPage, type VenueProduct } from "@/components/VenueProductPage";

export const metadata: Metadata = { title: "OMLU for Restaurants", description: "Connected restaurant ordering, table operations, kitchen, billing, staff and reporting.", alternates: { canonical: "https://omlu.in/restaurants" } };

const product: VenueProduct = {
  label: "OMLU for Restaurants",
  title: "Keep every part of restaurant service connected.",
  description: "Bring guest ordering, tables, kitchen activity, billing, staff and reporting into one operational workspace.",
  registrationHref: "/register?type=restaurant",
  workflows: [
    { title: "Ordering & tables", description: "Support QR, dine-in, takeaway and staff-assisted orders with a clear view of every table." },
    { title: "Kitchen operations", description: "Move orders into a focused kitchen queue and keep preparation status visible to the team." },
    { title: "Billing & payments", description: "Create bills, track payment status and keep service moving from order through settlement." },
    { title: "Staff access", description: "Give owners, managers, service staff and kitchen teams the access their work requires." },
    { title: "Menus & availability", description: "Manage items, options, categories and availability from the same workspace." },
    { title: "Reports & oversight", description: "Review sales and operational history with practical filters and exports." },
  ],
  audiences: ["Independent restaurants and cafés", "Quick-service teams", "Dine-in service teams", "Multi-outlet operators"],
  previewTitle: "Restaurant operations",
  previewItems: [{ label: "Table A04", detail: "3 items · Dine-in", status: "Preparing" }, { label: "Quick Sale 128", detail: "Counter order · Paid", status: "Ready" }, { label: "Table B02", detail: "Bill requested", status: "Billing" }],
  pricingTitle: "Start with a plan that fits your restaurant.",
  pricingDescription: "Choose from straightforward restaurant plans, with assisted onboarding available for more involved setups.",
};

export default function RestaurantsPage() { return <VenueProductPage product={product} />; }
