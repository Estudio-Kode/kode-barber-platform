import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBarberSession } from "@/lib/auth";
import { isValidSlotTime, parseIsoDateLocal } from "@/lib/domain";
import { readSafeJson } from "@/lib/request-guard";
import {
  dbBlockSlot,
  dbHasAppointmentAt,
  dbUnblockSlot,
} from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const session = await getAuthenticatedBarberSession(req);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = await readSafeJson(req);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status }
    );
  }
  const data = parsed.data;

  const dateStr = typeof data.date === "string" ? data.date.trim() : "";
  const timeStr = typeof data.time === "string" ? data.time.trim() : "";

  if (!parseIsoDateLocal(dateStr)) {
    return NextResponse.json({ error: "Data inválida." }, { status: 400 });
  }
  if (!isValidSlotTime(timeStr)) {
    return NextResponse.json({ error: "Horário inválido." }, { status: 400 });
  }

  try {
    const taken = await dbHasAppointmentAt(
      dateStr,
      timeStr,
      session.business_id
    );
    if (taken) {
      return NextResponse.json(
        {
          error:
            "Este horário já tem um cliente marcado. Desmarque o cliente antes de bloquear.",
        },
        { status: 409 }
      );
    }

    await dbBlockSlot(dateStr, timeStr, session.business_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/admin/blocks]", err);
    return NextResponse.json(
      { error: "Erro ao bloquear horário." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getAuthenticatedBarberSession(req);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = await readSafeJson(req);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status }
    );
  }
  const data = parsed.data;

  const dateStr = typeof data.date === "string" ? data.date.trim() : "";
  const timeStr = typeof data.time === "string" ? data.time.trim() : "";

  if (!parseIsoDateLocal(dateStr)) {
    return NextResponse.json({ error: "Data inválida." }, { status: 400 });
  }
  if (!isValidSlotTime(timeStr)) {
    return NextResponse.json({ error: "Horário inválido." }, { status: 400 });
  }

  try {
    await dbUnblockSlot(dateStr, timeStr, session.business_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/admin/blocks]", err);
    return NextResponse.json(
      { error: "Erro ao desbloquear horário." },
      { status: 500 }
    );
  }
}
