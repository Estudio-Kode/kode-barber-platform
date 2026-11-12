import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBarberSession } from "@/lib/auth";
import { parseBusinessBarber } from "@/lib/business-settings";
import { readSafeJson } from "@/lib/request-guard";
import {
  dbDeactivateBusinessBarber,
  dbGetBusinessTeam,
  dbSaveBusinessBarber,
} from "@/lib/supabase-server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedBarberSession(req);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Barbeiro inválido." }, { status: 400 });
  }
  const parsed = await readSafeJson(req);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status }
    );
  }
  const input = parseBusinessBarber(parsed.data);
  if ("error" in input) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }

  try {
    const team = await dbGetBusinessTeam(session.business_id);
    if (!team.barbers.some((barber) => barber.id === id)) {
      return NextResponse.json(
        { error: "Barbeiro não encontrado." },
        { status: 404 }
      );
    }
    const savedId = await dbSaveBusinessBarber({
      businessId: session.business_id,
      barberId: id,
      ...input,
    });
    return NextResponse.json({ ok: true, id: savedId });
  } catch (error) {
    console.error("[PUT /api/admin/barbers/:id]", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar o barbeiro." },
      { status: 503 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedBarberSession(req);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Barbeiro inválido." }, { status: 400 });
  }

  try {
    const deactivated = await dbDeactivateBusinessBarber(
      session.business_id,
      id
    );
    if (!deactivated) {
      return NextResponse.json(
        { error: "Barbeiro não encontrado ou já removido." },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/admin/barbers/:id]", error);
    return NextResponse.json(
      { error: "Não foi possível remover o barbeiro." },
      { status: 503 }
    );
  }
}
