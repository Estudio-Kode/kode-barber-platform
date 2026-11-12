import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBarberSession } from "@/lib/auth";
import { parseBusinessService } from "@/lib/business-settings";
import { readSafeJson } from "@/lib/request-guard";
import {
  dbGetBusinessSettings,
  dbSaveBusinessService,
} from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const session = await getAuthenticatedBarberSession(req);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const settings = await dbGetBusinessSettings(session.business_id);
    return NextResponse.json({ services: settings.services });
  } catch (error) {
    console.error("[GET /api/admin/services]", error);
    return NextResponse.json(
      { error: "Não foi possível carregar os serviços." },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getAuthenticatedBarberSession(req);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const parsed = await readSafeJson(req);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status }
    );
  }
  const input = parseBusinessService(parsed.data);
  if ("error" in input) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }

  try {
    const id = await dbSaveBusinessService({
      businessId: session.business_id,
      serviceId: null,
      ...input,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/admin/services]", error);
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error: /23505|duplicate key/i.test(message)
          ? "Já existe um serviço com esse nome nesta barbearia."
          : "Não foi possível cadastrar o serviço. Confirme se a migração de configurações foi aplicada.",
      },
      { status: /23505|duplicate key/i.test(message) ? 409 : 503 }
    );
  }
}
