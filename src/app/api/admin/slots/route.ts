import { NextRequest, NextResponse } from "next/server";
import { getAllSlots, getAppointmentPrice } from "@/config/business";
import { isAdminAuthenticated } from "@/lib/auth";
import { parseIsoDateLocal, slotIsPast } from "@/lib/domain";
import {
  dbGetAppointmentsByDate,
  dbGetBlockedTimes,
} from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated(req))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const dateStr = (req.nextUrl.searchParams.get("date") || "").trim();
  if (!parseIsoDateLocal(dateStr)) {
    return NextResponse.json({ error: "Data inválida." }, { status: 400 });
  }

  try {
    const [appts, blockedSet] = await Promise.all([
      dbGetAppointmentsByDate(dateStr),
      dbGetBlockedTimes(dateStr),
    ]);

    const byTime = new Map(appts.map((a) => [a.time, a]));

    const slots = getAllSlots().map((t) => {
      const appt = byTime.get(t);
      return {
        time: t,
        blocked: blockedSet.has(t),
        past: slotIsPast(dateStr, t),
        appointment: appt
          ? {
              id: appt.id,
              name: appt.name,
              phone: appt.phone,
              service: appt.service,
              price: getAppointmentPrice(appt.service),
            }
          : null,
      };
    });

    return NextResponse.json({ date: dateStr, slots });
  } catch (err) {
    console.error("[GET /api/admin/slots]", err);
    return NextResponse.json(
      { error: "Erro ao consultar horários." },
      { status: 500 }
    );
  }
}

