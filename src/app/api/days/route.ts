import { NextResponse } from "next/server";
import { getSelectableDays } from "@/lib/domain";

export async function GET() {
  return NextResponse.json({
    days: getSelectableDays(),
  });
}

