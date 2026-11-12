import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBarberSession } from "@/lib/auth";
import { dbGetBusinessSettings } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const session = await getAuthenticatedBarberSession(req);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    return NextResponse.json(await dbGetBusinessSettings(session.business_id));
  } catch (error) {
    console.error("[GET /api/admin/settings]", error);
    return NextResponse.json(
      { error: "Não foi possível carregar os serviços e horários." },
      { status: 503 }
    );
  }
}
