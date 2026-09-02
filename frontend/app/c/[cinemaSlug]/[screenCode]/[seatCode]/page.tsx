import type { Metadata } from "next";
import CinemaCustomerClient from "./CinemaCustomerClient";

export const metadata: Metadata={title:"Order concessions · Nadha Cinemas",description:"Order cinema snacks and drinks from your seat."};

export default async function CinemaCustomerPage({params}:{params:Promise<{cinemaSlug:string;screenCode:string;seatCode:string}>}){
  const {screenCode,seatCode}=await params;
  return <CinemaCustomerClient screenCode={screenCode} seatCode={seatCode}/>;
}
