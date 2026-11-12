import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  getBarberSession,
} from "@/lib/auth";
import {
  dbGetBusinessAdminAccess,
} from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const session = await getBarberSession(req);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  try {
    const access = await dbGetBusinessAdminAccess(
      session.business_id,
      session.user_id
    );
    if (
      !access ||
      access.business_status === "suspended" ||
      access.must_change_password !== session.must_change_password
    ) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    return NextResponse.json({
      authenticated: true,
      must_change_password: access.must_change_password,
      business: {
        id: access.business_id,
        name: access.business_name,
        slug: access.business_slug,
      },
    });
  } catch (error) {
    console.error("[GET /api/admin/session]", error);
    return NextResponse.json(
      { error: "Não foi possível validar a sessão." },
      { status: 503 }
    );
  }
}

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ADMIN_COOKIE_NAME);
  return response;
}
