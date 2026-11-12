import { NextRequest, NextResponse } from "next/server";
import {
  isPlatformAdminAuthenticated,
  PLATFORM_ADMIN_COOKIE_NAME,
} from "@/lib/auth";

export async function GET(req: NextRequest) {
  const authenticated = await isPlatformAdminAuthenticated(req);
  if (!authenticated) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true });
}

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(PLATFORM_ADMIN_COOKIE_NAME);
  return response;
}
