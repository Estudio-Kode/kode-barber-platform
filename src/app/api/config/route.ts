import { NextResponse } from "next/server";
import { BUSINESS_CONFIG } from "@/config/business";

export async function GET() {
  return NextResponse.json({
    business_name: BUSINESS_CONFIG.business_name,
    whatsapp: BUSINESS_CONFIG.whatsapp,
    currency: BUSINESS_CONFIG.currency,
    services: BUSINESS_CONFIG.services,
    direct_services: BUSINESS_CONFIG.direct_services,
    booking_cutoff_minutes: BUSINESS_CONFIG.booking_cutoff_minutes,
    week_booking_limit: BUSINESS_CONFIG.week_booking_limit,
  });
}

