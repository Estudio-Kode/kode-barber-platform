import { NextRequest } from "next/server";

export const MAX_JSON_BODY_BYTES = 16 * 1024; // 16 KB (anti-DoS)

const bookingHits = new Map<string, number[]>();
const BOOKING_MAX_PER_WINDOW = 12;
const BOOKING_WINDOW_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Lê o corpo JSON com limite estrito de tamanho (evita payload gigante / DoS).
 */
export async function readSafeJson(
  req: NextRequest
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > MAX_JSON_BODY_BYTES) {
    return {
      ok: false,
      status: 413,
      error: "Requisição excede o tamanho máximo permitido.",
    };
  }

  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return { ok: false, status: 400, error: "Requisição inválida." };
  }

  if (Buffer.byteLength(raw, "utf8") > MAX_JSON_BODY_BYTES) {
    return {
      ok: false,
      status: 413,
      error: "Requisição excede o tamanho máximo permitido.",
    };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, status: 400, error: "Formato JSON inválido." };
    }
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400, error: "Requisição inválida." };
  }
}

export function isBookingRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (bookingHits.get(ip) || []).filter(
    (t) => now - t < BOOKING_WINDOW_MS
  );
  if (recent.length > 0) {
    bookingHits.set(ip, recent);
  } else {
    bookingHits.delete(ip);
  }
  return recent.length >= BOOKING_MAX_PER_WINDOW;
}

export function recordBookingAttempt(ip: string): void {
  const list = bookingHits.get(ip) || [];
  list.push(Date.now());
  bookingHits.set(ip, list);
}
