import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

export const ADMIN_COOKIE_NAME = "ziah_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 horas

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 5 * 60 * 1000; // 5 minutos

// Controle de rate-limit por IP
const loginAttempts = new Map<string, number[]>();

function getSessionSecret(): string {
  return (
    process.env.BARBER_SESSION_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    "fallback-dev-secret-change-in-production"
  );
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const hashA = crypto.createHash("sha256").update(a, "utf8").digest();
  const hashB = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function verifyAdminCredentials(
  username: unknown,
  password: unknown
): boolean {
  const givenUser = typeof username === "string" ? username.trim() : "";
  const givenPass = typeof password === "string" ? password : "";

  const expectedUser = (process.env.BARBER_ADMIN_USER || "admin").trim();
  const expectedPass = process.env.BARBER_ADMIN_PASSWORD || "";

  if (!expectedPass) {
    return false;
  }

  const userOk = timingSafeEqualStr(givenUser, expectedUser);
  const passOk = timingSafeEqualStr(givenPass, expectedPass);
  return userOk && passOk;
}

export function createSignedSessionToken(): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const nonce = crypto.randomBytes(16).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub: "admin", exp, nonce }),
    "utf8"
  ).toString("base64url");

  const sig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");

  return `${payload}.${sig}`;
}

export function verifySignedSessionToken(token: string | undefined | null): boolean {
  if (!token || !token.includes(".")) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;

  const expectedSig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");

  if (!timingSafeEqualStr(sig, expectedSig)) return false;

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );
    if (typeof decoded.exp !== "number") return false;
    const nowSec = Math.floor(Date.now() / 1000);
    return decoded.exp > nowSec;
  } catch {
    return false;
  }
}

export async function isAdminAuthenticated(req?: NextRequest): Promise<boolean> {
  // 1. Checa cookie HttpOnly
  try {
    const cookieStore = await cookies();
    const cookieToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (verifySignedSessionToken(cookieToken)) {
      return true;
    }
  } catch {
    // fallback para header
  }

  // 2. Fallback: Bearer token (compatibilidade com clientes de API/testes)
  if (req) {
    const authHeader = req.headers.get("authorization") || "";
    if (authHeader.startsWith("Bearer ")) {
      const bearer = authHeader.slice(7).trim();
      if (verifySignedSessionToken(bearer)) {
        return true;
      }
    }
    const reqCookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
    if (verifySignedSessionToken(reqCookie)) {
      return true;
    }
  }

  return false;
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim().slice(0, 64);
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim().slice(0, 64);
  }
  return "127.0.0.1";
}

export function isLoginRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (loginAttempts.get(ip) || []).filter(
    (t) => now - t < LOGIN_WINDOW_MS
  );
  if (recent.length > 0) {
    loginAttempts.set(ip, recent);
  } else {
    loginAttempts.delete(ip);
  }
  return recent.length >= LOGIN_MAX_ATTEMPTS;
}

export function recordLoginFailure(ip: string): void {
  const list = loginAttempts.get(ip) || [];
  list.push(Date.now());
  loginAttempts.set(ip, list);
}

export function clearLoginFailures(ip: string): void {
  loginAttempts.delete(ip);
}

export function getSessionCookieOptions() {
  return {
    name: ADMIN_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

