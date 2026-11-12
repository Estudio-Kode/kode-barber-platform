import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBarberSession } from "@/lib/auth";
import { MAX_NOTE_LEN, parseIsoDateLocal } from "@/lib/domain";
import { readSafeJson } from "@/lib/request-guard";
import { dbGetDayNote, dbSaveDayNote } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const session = await getAuthenticatedBarberSession(req);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const dateStr = (req.nextUrl.searchParams.get("date") || "").trim();
  if (!parseIsoDateLocal(dateStr)) {
    return NextResponse.json({ error: "Data inválida." }, { status: 400 });
  }

  try {
    const note = await dbGetDayNote(dateStr, session.business_id);
    return NextResponse.json({ date: dateStr, note });
  } catch (err) {
    console.error("[GET /api/admin/notes]", err);
    return NextResponse.json(
      { error: "Erro ao carregar observações." },
      { status: 500 }
    );
  }
}

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
  if (!parseIsoDateLocal(dateStr)) {
    return NextResponse.json({ error: "Data inválida." }, { status: 400 });
  }

  const rawNote = typeof data.note === "string" ? data.note : "";
  const note = rawNote.replace(/\x00/g, "").slice(0, MAX_NOTE_LEN);

  try {
    await dbSaveDayNote(dateStr, note, session.business_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/admin/notes]", err);
    return NextResponse.json(
      { error: "Erro ao salvar observações." },
      { status: 500 }
    );
  }
}
