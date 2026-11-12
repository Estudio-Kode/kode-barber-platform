import { NextRequest, NextResponse } from "next/server";
import {
  clearLoginFailures,
  createSignedPlatformSessionToken,
  getClientIp,
  getPlatformSessionCookieOptions,
  isLoginRateLimited,
  recordLoginFailure,
  verifyPlatformAdminCredentials,
} from "@/lib/auth";
import { readSafeJson } from "@/lib/request-guard";

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

  if (
    !process.env.PLATFORM_ADMIN_USER ||
    !process.env.PLATFORM_ADMIN_PASSWORD ||
    (process.env.PLATFORM_SESSION_SECRET || "").length < 32
  ) {
    return NextResponse.json(
      { error: "A autenticação da plataforma ainda não foi configurada." },
      { status: 503 }
    );
  }

  if (
    !verifyPlatformAdminCredentials(
      parsed.data.username,
      parsed.data.password
    )
  ) {
    recordLoginFailure(ip);
    return NextResponse.json(
      { error: "Usuário ou senha incorretos." },
      { status: 401 }
    );
  }

  clearLoginFailures(ip);
  const token = createSignedPlatformSessionToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    ...getPlatformSessionCookieOptions(),
    value: token,
  });
  return response;
}
