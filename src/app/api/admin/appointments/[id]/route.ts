import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBarberSession } from "@/lib/auth";
import {
  dbDeleteAppointmentById,
  dbGetAppointmentById,
} from "@/lib/supabase-server";
import { notifyCancelledBooking } from "@/lib/telegram";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedBarberSession(req);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await context.params;
  const apptId = Number(id);
  if (!Number.isInteger(apptId) || apptId <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  try {
    const row = await dbGetAppointmentById(apptId, session.business_id);
    if (!row) {
      return NextResponse.json(
        { error: "Marcação não encontrada." },
        { status: 404 }
      );
    }

    await dbDeleteAppointmentById(apptId, session.business_id);

    notifyCancelledBooking({
      name: row.name,
      phone: row.phone,
      service: row.service,
      date: row.date,
      time: row.time,
      byAdmin: true,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/admin/appointments/:id]", err);
    return NextResponse.json(
      { error: "Erro ao desmarcar horário." },
      { status: 500 }
    );
  }
}

