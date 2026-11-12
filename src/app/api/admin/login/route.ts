import { NextRequest, NextResponse } from "next/server";
import {
  clearLoginFailures,
  createSignedBarberSessionToken,
  getClientIp,
  getSessionCookieOptions,
  isLoginRateLimited,
  recordLoginFailure,
} from "@/lib/auth";
import { readSafeJson } from "@/lib/request-guard";
import {
  dbGetBusinessAdminAccessesByUser,
  dbSignInBusinessAdmin,
} from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isLoginRateLimited(ip)) {
    return NextResponse.json(
      { error: "Muitas tentativas de login. Tente novamente em alguns minutos." },
      { status: 429 }
    );
  }

  const parsed = await readSafeJson(req);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status }
    );
  }

  const email =
    typeof parsed.data.email === "string"
      ? parsed.data.email.trim().toLowerCase()
      : "";
  const password =
    typeof parsed.data.password === "string" ? parsed.data.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
    recordLoginFailure(ip);
    return NextResponse.json(
      { error: "E-mail ou senha incorretos." },
      { status: 401 }
    );
  }

  try {
    const user = await dbSignInBusinessAdmin(email, password);
    if (!user) {
      recordLoginFailure(ip);
      return NextResponse.json(
        { error: "E-mail ou senha incorretos." },
        { status: 401 }
      );
    }

    const accesses = await dbGetBusinessAdminAccessesByUser(user.id);
    if (accesses.length !== 1) {
      recordLoginFailure(ip);
      return NextResponse.json(
        { error: "Não foi possível localizar o acesso ativo desta barbearia." },
        { status: 403 }
      );
    }
    const access = accesses[0];
    if (access.business_status === "suspended") {
      recordLoginFailure(ip);
      return NextResponse.json(
        { error: "O acesso desta barbearia está suspenso." },
        { status: 403 }
      );
    }

    clearLoginFailures(ip);
    const session = {
      user_id: user.id,
      business_id: access.business_id,
      email: access.login_email,
      must_change_password: access.must_change_password,
    };
    const token = createSignedBarberSessionToken(session);
    const response = NextResponse.json({
      ok: true,
      must_change_password: session.must_change_password,
    });
    response.cookies.set({ ...getSessionCookieOptions(), value: token });
    return response;
  } catch (error) {
    console.error("[POST /api/admin/login]", error);
    return NextResponse.json(
      { error: "Não foi possível autenticar. Tente novamente." },
      { status: 503 }
    );
  }
}
