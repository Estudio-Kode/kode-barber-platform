import { NextRequest, NextResponse } from "next/server";
import { getAllSlots } from "@/config/business";
import {
  isValidBookingDate,
  slotIsPast,
  slotWithinCutoff,
} from "@/lib/domain";
import {
  dbGetAppointmentsByDate,
  dbGetBlockedTimes,
} from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const dateStr = (req.nextUrl.searchParams.get("date") || "").trim();
  if (!isValidBookingDate(dateStr)) {
    return NextResponse.json(
      { error: "Data inválida ou fora do período permitido" },
      { status: 400 }
    );
  }

  try {
    const [appts, blockedSet] = await Promise.all([
      dbGetAppointmentsByDate(dateStr),
      dbGetBlockedTimes(dateStr),
    ]);
    const bookedSet = new Set(appts.map((a) => a.time));

    const slots = getAllSlots().map((t) => ({
      time: t,
      booked: bookedSet.has(t),
      blocked: blockedSet.has(t),
      past: slotIsPast(dateStr, t),
      too_soon: slotWithinCutoff(dateStr, t),
    }));

    return NextResponse.json({ date: dateStr, slots });
  } catch (err) {
    console.error("[GET /api/availability]", err);
    return NextResponse.json(
      { error: "Erro ao consultar disponibilidade." },
      { status: 500 }
    );
  }
}

