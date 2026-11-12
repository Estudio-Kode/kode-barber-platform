import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { dbGetBusinessAdminAccess } from "@/lib/supabase-server";

export const ADMIN_COOKIE_NAME = "barber_admin_session";
export const PLATFORM_ADMIN_COOKIE_NAME = "kode_platform_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 horas

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 5 * 60 * 1000; // 5 minutos

// Controle de rate-limit por IP
const loginAttempts = new Map<string, number[]>();

function getSessionSecret(): string {
  return process.env.BARBER_SESSION_SECRET || "";
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const hashA = crypto.createHash("sha256").update(a, "utf8").digest();
  const hashB = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function verifyPlatformAdminCredentials(
  username: unknown,
  password: unknown
): boolean {
  const givenUser = typeof username === "string" ? username.trim() : "";
  const givenPass = typeof password === "string" ? password : "";
  const expectedUser = (process.env.PLATFORM_ADMIN_USER || "").trim();
  const expectedPass = process.env.PLATFORM_ADMIN_PASSWORD || "";

  if (!expectedUser || !expectedPass) return false;
  return (
    timingSafeEqualStr(givenUser, expectedUser) &&
    timingSafeEqualStr(givenPass, expectedPass)
  );
}

function createSignedToken(
  subject: string,
  secret: string,
  claims: object = {}
): string {
  if (secret.length < 32) {
    throw new Error("O segredo da sessão deve ter pelo menos 32 caracteres.");
  }
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const nonce = crypto.randomBytes(16).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub: subject, exp, nonce, ...claims }),
    "utf8"
  ).toString("base64url");

  const sig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  return `${payload}.${sig}`;
}

export interface BarberSession {
  user_id: string;
  business_id: string;
  email: string;
  must_change_password: boolean;
}

export async function getBarberSession(
  req?: NextRequest
): Promise<BarberSession | null> {
  const secret = getSessionSecret();
  if (secret.length < 32) return null;

  let token: string | undefined;
  try {
    token = (await cookies()).get(ADMIN_COOKIE_NAME)?.value;
  } catch {
    // Route handlers can still provide their request cookies below.
  }
  if (!token && req) {
    const authHeader = req.headers.get("authorization") || "";
    token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  }
  if (!token) return null;

  const claims = readSignedSessionToken(token, "barber-admin", secret);
  if (
    !claims ||
    typeof claims.user_id !== "string" ||
    typeof claims.business_id !== "string" ||
    typeof claims.email !== "string" ||
    typeof claims.must_change_password !== "boolean"
  ) {
    return null;
  }

  return {
    user_id: claims.user_id,
    business_id: claims.business_id,
    email: claims.email,
    must_change_password: claims.must_change_password,
  };
}

export async function getAuthenticatedBarberSession(
  req?: NextRequest,
  allowPasswordChange = false
): Promise<BarberSession | null> {
  const session = await getBarberSession(req);
  if (!session || (session.must_change_password && !allowPasswordChange)) {
    return null;
  }

  const access = await dbGetBusinessAdminAccess(
    session.business_id,
    session.user_id
  );
  if (
    !access ||
    access.business_status === "suspended" ||
    access.must_change_password !== session.must_change_password
  ) {
    return null;
  }
  return session;
}

export function createSignedBarberSessionToken(
  session: BarberSession
): string {
  return createSignedToken("barber-admin", getSessionSecret(), session);
}

export function createSignedPlatformSessionToken(): string {
  const secret = process.env.PLATFORM_SESSION_SECRET || "";
  if (secret.length < 32) {
    throw new Error("PLATFORM_SESSION_SECRET deve ter pelo menos 32 caracteres.");
  }
  return createSignedToken("platform-admin", secret);
}

export function verifySignedSessionToken(
  token: string | undefined | null,
  expectedSubject = "admin",
  secret = getSessionSecret()
): boolean {
  return readSignedSessionToken(token, expectedSubject, secret) !== null;
}

function readSignedSessionToken(
  token: string | undefined | null,
  expectedSubject: string,
  secret: string
): Record<string, unknown> | null {
  if (secret.length < 32) return null;
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  if (!timingSafeEqualStr(sig, expectedSig)) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );
    if (decoded.sub !== expectedSubject || typeof decoded.exp !== "number") {
      return null;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    return decoded.exp > nowSec ? decoded : null;
  } catch {
    return null;
  }
}

export async function isAdminAuthenticated(req?: NextRequest): Promise<boolean> {
  return Boolean(await getAuthenticatedBarberSession(req));
}

export async function isPlatformAdminAuthenticated(
  req?: NextRequest
): Promise<boolean> {
  const secret = process.env.PLATFORM_SESSION_SECRET || "";
  if (secret.length < 32) return false;

  try {
    const cookieToken = (await cookies()).get(PLATFORM_ADMIN_COOKIE_NAME)?.value;
    if (verifySignedSessionToken(cookieToken, "platform-admin", secret)) {
      return true;
    }
  } catch {
    // Fall back to the request credentials when the cookie store is unavailable.
  }

  if (req) {
    const authHeader = req.headers.get("authorization") || "";
    if (authHeader.startsWith("Bearer ")) {
      const bearer = authHeader.slice(7).trim();
      if (verifySignedSessionToken(bearer, "platform-admin", secret)) {
        return true;
      }
    }
    const reqCookie = req.cookies.get(PLATFORM_ADMIN_COOKIE_NAME)?.value;
    if (verifySignedSessionToken(reqCookie, "platform-admin", secret)) {
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

export function getPlatformSessionCookieOptions() {
  return {
    name: PLATFORM_ADMIN_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

