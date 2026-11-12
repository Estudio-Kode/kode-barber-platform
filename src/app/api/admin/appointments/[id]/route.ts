import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBarberSession } from "@/lib/auth";
import {
  dbDeleteAppointmentById,
  dbGetAppointmentById,
  dbUpdateAppointmentStatus,
} from "@/lib/supabase-server";
import { notifyCancelledBooking } from "@/lib/telegram";
import { readSafeJson } from "@/lib/request-guard";

type UpdatableAppointmentStatus = "completed" | "cancelled" | "no_show";

function isUpdatableAppointmentStatus(
  value: unknown
): value is UpdatableAppointmentStatus {
  return (
    value === "completed" || value === "cancelled" || value === "no_show"
  );
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedBarberSession(req);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await context.params;
  const appointmentId = Number(id);
  if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  try {
    const appointment = await dbGetAppointmentById(
      appointmentId,
      session.business_id
    );
    if (!appointment) {
      return NextResponse.json(
        { error: "Marcação não encontrada." },
        { status: 404 }
      );
    }

    await dbDeleteAppointmentById(appointmentId, session.business_id);
    notifyCancelledBooking({ ...appointment, byAdmin: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/admin/appointments/:id]", error);
    return NextResponse.json(
      { error: "Erro ao desmarcar horário." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedBarberSession(req);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const { id } = await context.params;
  const appointmentId = Number(id);
  if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const parsed = await readSafeJson(req);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status }
    );
  }
  const status = parsed.data.status;
  if (!isUpdatableAppointmentStatus(status)) {
    return NextResponse.json(
      { error: "Status de agendamento inválido." },
      { status: 400 }
    );
  }

  try {
    const appointment = await dbGetAppointmentById(
      appointmentId,
      session.business_id
    );
    if (!appointment) {
      return NextResponse.json(
        { error: "Agendamento não encontrado." },
        { status: 404 }
      );
    }

    const updated = await dbUpdateAppointmentStatus(
      appointmentId,
      session.business_id,
      status
    );
    if (!updated) {
      return NextResponse.json(
        { error: "Este agendamento já foi atualizado." },
        { status: 409 }
      );
    }

    if (status === "cancelled") {
      notifyCancelledBooking({ ...appointment, byAdmin: true });
    }
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    console.error("[PATCH /api/admin/appointments/:id]", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar o agendamento." },
      { status: 503 }
    );
  }
}
