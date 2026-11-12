import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBarberSession } from "@/lib/auth";
import { parseBusinessService } from "@/lib/business-settings";
import { readSafeJson } from "@/lib/request-guard";
import {
  dbDeactivateBusinessService,
  dbGetBusinessSettings,
  dbSaveBusinessService,
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
    return NextResponse.json({ error: "Serviço inválido." }, { status: 400 });
  }

  const parsed = await readSafeJson(req);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status }
    );
  }

  try {
    const settings = await dbGetBusinessSettings(session.business_id);
    const current = settings.services.find((service) => service.id === id);
    if (!current) {
      return NextResponse.json(
        { error: "Serviço não encontrado." },
        { status: 404 }
      );
    }

    const input = parseBusinessService(parsed.data, current);
    if ("error" in input) {
      return NextResponse.json({ error: input.error }, { status: 400 });
    }
    const savedId = await dbSaveBusinessService({
      businessId: session.business_id,
      serviceId: id,
      ...input,
    });
    return NextResponse.json({ ok: true, id: savedId });
  } catch (error) {
    console.error("[PUT /api/admin/services/:id]", error);
    const message = error instanceof Error ? error.message : "";
    const isDuplicate = /23505|duplicate key/i.test(message);
    return NextResponse.json(
      {
        error: isDuplicate
          ? "Já existe um serviço com esse nome nesta barbearia."
          : "Não foi possível atualizar o serviço. Confirme se a migração de configurações foi aplicada.",
      },
      { status: isDuplicate ? 409 : 503 }
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
    return NextResponse.json({ error: "Serviço inválido." }, { status: 400 });
  }

  try {
    const deactivated = await dbDeactivateBusinessService(
      session.business_id,
      id
    );
    if (!deactivated) {
      return NextResponse.json(
        { error: "Serviço não encontrado ou já removido." },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/admin/services/:id]", error);
    return NextResponse.json(
      { error: "Não foi possível remover o serviço." },
      { status: 503 }
    );
  }
}
