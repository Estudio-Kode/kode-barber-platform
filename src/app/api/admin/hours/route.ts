import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBarberSession } from "@/lib/auth";
import { parseBusinessSchedule } from "@/lib/business-settings";
import { readSafeJson } from "@/lib/request-guard";
import { dbSaveBusinessSchedule } from "@/lib/supabase-server";

export async function PUT(req: NextRequest) {
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
  const schedule = parseBusinessSchedule(parsed.data.hours);
  if ("error" in schedule) {
    return NextResponse.json({ error: schedule.error }, { status: 400 });
  }

  try {
    await dbSaveBusinessSchedule(session.business_id, schedule.hours);
    return NextResponse.json({ ok: true, hours: schedule.hours });
  } catch (error) {
    console.error("[PUT /api/admin/hours]", error);
    return NextResponse.json(
      {
        error:
          "Não foi possível salvar os horários. Confirme se as migrações de configurações e horários exatos foram aplicadas.",
      },
      { status: 503 }
    );
  }
}
