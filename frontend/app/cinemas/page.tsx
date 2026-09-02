import type { Metadata } from "next";
import { VenueProductPage, type VenueProduct } from "@/components/VenueProductPage";

export const metadata: Metadata = { title: "OMLU for Cinemas", description: "Seat-based concession ordering, screens and seats, concession KDS, customer tracking and cinema operations.", alternates: { canonical: "https://omlu.in/cinemas" } };

const product: VenueProduct = {
  label: "OMLU for Cinemas",
  title: "Concession service that knows every screen and seat.",
  description: "Connect seat-based ordering, screen and seat setup, concession preparation, customer tracking and day-to-day cinema operations.",
  registrationHref: "/register?type=cinema",
  workflows: [
    { title: "Seat-based ordering", description: "Associate concession orders with the right screen, row and seat for a clear fulfilment path." },
    { title: "Screens & seats", description: "Organize the venue around its real screens and seating layout." },
    { title: "Concession KDS", description: "Route orders into a dedicated preparation view with visible status changes." },
    { title: "Customer tracking", description: "Help teams follow an order from placement through preparation and delivery." },
    { title: "Menu operations", description: "Control concession items and availability from a central workspace." },
    { title: "Cinema oversight", description: "Keep current operational activity visible to owners and venue teams." },
  ],
  audiences: ["Independent cinemas", "Multiplex operations", "Concession teams", "Cinema owners and managers"],
  previewTitle: "Concession operations",
  previewItems: [{ label: "Screen 2 · G12", detail: "Popcorn combo · 2 items", status: "Preparing" }, { label: "Screen 1 · C07", detail: "Nachos · Cold drink", status: "Ready" }, { label: "Screen 4 · A03", detail: "Seat delivery", status: "Queued" }],
  pricingTitle: "Pricing shaped around your cinema operation.",
  pricingDescription: "Tell us about your screens and concession workflow so OMLU can match the setup to your venue.",
};

export default function CinemasPage() { return <VenueProductPage product={product} />; }
