import { Metadata } from "next";
import PrintingClient from "./PrintingClient";

export const metadata: Metadata = {
  title: "Printing | OMLU Admin",
  description: "Set up OMLU Print and manage billing and kitchen printers.",
};

export default function PrintingPage() {
  return <PrintingClient />;
}
