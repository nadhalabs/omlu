import { Metadata } from "next";
import PrintingClient from "./PrintingClient";

export const metadata: Metadata = {
  title: "Printing | OMLU Admin",
  description: "Manage thermal receipt printers, Desktop Printer Bridge, and print jobs.",
};

export default function PrintingPage() {
  return <PrintingClient />;
}
