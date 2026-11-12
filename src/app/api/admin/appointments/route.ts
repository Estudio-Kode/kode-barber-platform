import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBarberSession } from "@/lib/auth";
import { getTodayIso, parseIsoDateLocal } from "@/lib/domain";
import {
  dbGetAllAppointments,
  dbGetAppointmentsByDate,
} from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const session = await getAuthenticatedBarberSession(req);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const dateStr = (req.nextUrl.searchParams.get("date") || "").trim();
  if (dateStr && !parseIsoDateLocal(dateStr)) {
    return NextResponse.json({ error: "Data inválida." }, { status: 400 });
  }

  try {
    const appointments = dateStr
      ? await dbGetAppointmentsByDate(dateStr, session.business_id)
      : await dbGetAllAppointments(session.business_id);

    return NextResponse.json({
      appointments,
      today: getTodayIso(),
    });
  } catch (err) {
    console.error("[GET /api/admin/appointments]", err);
    return NextResponse.json(
      { error: "Erro ao consultar agendamentos." },
      { status: 500 }
    );
  }
}

