import { NextRequest, NextResponse } from "next/server";
import {
  clearLoginFailures,
  createSignedSessionToken,
  getClientIp,
  getSessionCookieOptions,
  isLoginRateLimited,
  recordLoginFailure,
  verifyAdminCredentials,
} from "@/lib/auth";
import { readSafeJson } from "@/lib/request-guard";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isLoginRateLimited(ip)) {
    return NextResponse.json(
      {
        error:
          "Muitas tentativas de login. Tente novamente em alguns minutos.",
      },
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
  const data = parsed.data;

  if (verifyAdminCredentials(data.username, data.password)) {
    clearLoginFailures(ip);
    const token = createSignedSessionToken();
    const res = NextResponse.json({ ok: true, token });
    res.cookies.set({
      ...getSessionCookieOptions(),
      value: token,
    });
    return res;
  }

  recordLoginFailure(ip);
  return NextResponse.json(
    { error: "Usuário ou senha incorretos." },
    { status: 401 }
  );
}
