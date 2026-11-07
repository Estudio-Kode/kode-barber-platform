import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { getTodayIso, parseIsoDateLocal } from "@/lib/domain";
import {
  dbGetAllAppointments,
  dbGetAppointmentsByDate,
} from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated(req))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const dateStr = (req.nextUrl.searchParams.get("date") || "").trim();
  if (dateStr && !parseIsoDateLocal(dateStr)) {
    return NextResponse.json({ error: "Data inválida." }, { status: 400 });
  }

  try {
    const appointments = dateStr
      ? await dbGetAppointmentsByDate(dateStr)
      : await dbGetAllAppointments();

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

