import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBarberSession } from "@/lib/auth";
import { parseBusinessBarber } from "@/lib/business-settings";
import { readSafeJson } from "@/lib/request-guard";
import {
  dbGetBusinessTeam,
  dbSaveBusinessBarber,
} from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const session = await getAuthenticatedBarberSession(req);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    return NextResponse.json(await dbGetBusinessTeam(session.business_id));
  } catch (error) {
    console.error("[GET /api/admin/barbers]", error);
    return NextResponse.json(
      { error: "Não foi possível carregar a equipe." },
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
  const input = parseBusinessBarber(parsed.data);
  if ("error" in input) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }

  try {
    const id = await dbSaveBusinessBarber({
      businessId: session.business_id,
      barberId: null,
      ...input,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/admin/barbers]", error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("BARBER_PLAN_LIMIT")) {
      return NextResponse.json(
        { error: "O limite de barbeiros do plano foi atingido." },
        { status: 409 }
      );
    }
    if (message.includes("BARBER_MULTIPLE_FEATURE_DISABLED")) {
      return NextResponse.json(
        {
          error:
            "O plano atual não inclui múltiplos barbeiros. Solicite a alteração do plano pela central da plataforma.",
        },
        { status: 403 }
      );
    }
    if (message.includes("Service not found")) {
      return NextResponse.json(
        { error: "Um dos serviços selecionados não está ativo nesta barbearia." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Não foi possível adicionar o barbeiro." },
      { status: 503 }
    );
  }
}
