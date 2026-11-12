import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBarberSession } from "@/lib/auth";
import {
  getTodayIso,
  parseIsoDateLocal,
  slotIsPast,
  toIsoDate,
} from "@/lib/domain";
import { dbGetAppointmentsInDateRange } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const session = await getAuthenticatedBarberSession(req);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const today = getTodayIso();
  const lastDay = parseIsoDateLocal(today);
  if (!lastDay) {
    return NextResponse.json(
      { error: "Não foi possível determinar a data atual." },
      { status: 500 }
    );
  }
  lastDay.setDate(lastDay.getDate() + 6);
  const endDate = toIsoDate(lastDay);

  try {
    const appointments = await dbGetAppointmentsInDateRange(
      session.business_id,
      today,
      endDate
    );
    const upcomingAppointments = appointments.filter(
      (appointment) =>
        appointment.status === "scheduled" &&
        !slotIsPast(appointment.date, appointment.time)
    );
    return NextResponse.json({
      today,
      end_date: endDate,
      appointments,
      upcoming_appointments: upcomingAppointments,
    });
  } catch (error) {
    console.error("[GET /api/admin/summary]", error);
    return NextResponse.json(
      { error: "Não foi possível carregar os indicadores da agenda." },
      { status: 503 }
    );
  }
}
