import { NextRequest, NextResponse } from "next/server";
import {
  createSignedBarberSessionToken,
  getBarberSession,
  getSessionCookieOptions,
} from "@/lib/auth";
import { isStrongPassword } from "@/lib/password-policy";
import { readSafeJson } from "@/lib/request-guard";
import {
  dbChangeBusinessAdminPassword,
  dbGetBusinessAdminAccess,
} from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const session = await getBarberSession(req);
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

  const password =
    typeof parsed.data.password === "string" ? parsed.data.password : "";
  if (!isStrongPassword(password)) {
    return NextResponse.json(
      {
        error:
          "A senha deve ter pelo menos 8 caracteres, uma letra maiúscula, um número e um caractere especial.",
      },
      { status: 400 }
    );
  }

  try {
    const access = await dbGetBusinessAdminAccess(
      session.business_id,
      session.user_id
    );
    if (
      !access ||
      access.business_status === "suspended" ||
      !access.must_change_password
    ) {
      return NextResponse.json(
        { error: "Esta sessão não pode alterar a senha." },
        { status: 403 }
      );
    }

    await dbChangeBusinessAdminPassword({
      businessId: session.business_id,
      userId: session.user_id,
      password,
    });

    const nextSession = { ...session, must_change_password: false };
    const token = createSignedBarberSessionToken(nextSession);
    const response = NextResponse.json({ ok: true });
    response.cookies.set({ ...getSessionCookieOptions(), value: token });
    return response;
  } catch (error) {
    console.error("[POST /api/admin/password]", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar a senha. Tente novamente." },
      { status: 503 }
    );
  }
}
