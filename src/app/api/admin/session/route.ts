import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, isAdminAuthenticated } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const authenticated = await isAdminAuthenticated(req);
  if (!authenticated) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true });
}

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_COOKIE_NAME);
  return res;
}

