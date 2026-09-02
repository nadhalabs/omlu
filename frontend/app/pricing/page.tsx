import type { Metadata } from "next";
import { Suspense } from "react";
import PricingClient from "./PricingClient";

const description = "OMLU pricing for restaurant and cinema operations.";

export const metadata: Metadata = {
  title: "Pricing | OMLU",
  description,
  alternates: { canonical: "https://omlu.in/pricing" },
  openGraph: { title: "Pricing | OMLU", description, type: "website", url: "https://omlu.in/pricing" },
};

export default function PricingPage() {
  return <Suspense fallback={null}><PricingClient /></Suspense>;
}
