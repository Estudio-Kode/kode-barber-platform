import {
  BUSINESS_CONFIG,
  MONTH_LABELS,
  WEEKDAY_LABELS,
  getAllSlots,
} from "@/config/business";

const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

export const MAX_NAME_LEN = 60;
export const MAX_NOTE_LEN = 2000;

export function sanitizeText(value: unknown, maxLen: number): string {
  const raw = typeof value === "string" ? value : "";
  return raw.replace(CONTROL_CHARS, "").trim().slice(0, maxLen);
}

export function normalizePhone(raw: unknown): string {
  const str = typeof raw === "string" ? raw : "";
  return str.replace(/\D/g, "");
}

export function formatPhoneBr(digits: string): string {
  const d = normalizePhone(digits);
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return d;
}

/**
 * Retorna a data/hora atual no fuso horário de São Paulo (America/Sao_Paulo)
 * para garantir que o servidor (mesmo rodando em UTC na nuvem) valide dias e
 * horários exatamente no horário local da barbearia.
 */
export function getNowBr(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const hour = map.hour === "24" ? "00" : map.hour;
  return new Date(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(hour),
    Number(map.minute),
    Number(map.second)
  );
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getTodayIso(): string {
  return toIsoDate(getNowBr());
}

/**
 * Converte Date.getDay() do JS (0=Dom..6=Sáb) para Python weekday() (0=Seg..6=Dom)
 */
export function pyWeekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function parseIsoDateLocal(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt;
}

export interface SelectableDay {
  date: string;
  weekday: string;
  day: number;
  month: string;
  is_today: boolean;
}

export function getSelectableDays(): SelectableDay[] {
  const now = getNowBr();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out: SelectableDay[] = [];

  for (let offset = 0; offset <= BUSINESS_CONFIG.max_days_ahead; offset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    const wd = pyWeekday(d);
    if (BUSINESS_CONFIG.open_weekdays.includes(wd)) {
      out.push({
        date: toIsoDate(d),
        weekday: WEEKDAY_LABELS[wd],
        day: d.getDate(),
        month: MONTH_LABELS[d.getMonth() + 1],
        is_today: offset === 0,
      });
    }
  }
  return out;
}

export function isValidBookingDate(dateStr: string): boolean {
  const d = parseIsoDateLocal(dateStr);
  if (!d) return false;

  const now = getNowBr();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + BUSINESS_CONFIG.max_days_ahead);

  if (d < today || d > maxDate) return false;
  const wd = pyWeekday(d);
  return BUSINESS_CONFIG.open_weekdays.includes(wd);
}

export function minutesUntilSlot(dateStr: string, timeStr: string): number | null {
  const d = parseIsoDateLocal(dateStr);
  if (!d || !/^\d{2}:\d{2}$/.test(timeStr)) return null;
  const [hh, mm] = timeStr.split(":").map(Number);
  const slotDt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0);
  const now = getNowBr();
  return (slotDt.getTime() - now.getTime()) / 60000;
}

export function slotIsPast(dateStr: string, timeStr: string): boolean {
  const mins = minutesUntilSlot(dateStr, timeStr);
  if (mins === null) return true;
  return mins <= 0;
}

export function slotWithinCutoff(dateStr: string, timeStr: string): boolean {
  const mins = minutesUntilSlot(dateStr, timeStr);
  if (mins === null) return false;
  const cutoff = BUSINESS_CONFIG.booking_cutoff_minutes ?? 30;
  return mins > 0 && mins <= cutoff;
}

export function getWeekBounds(dateStr: string): [string, string] {
  const d = parseIsoDateLocal(dateStr);
  if (!d) return [dateStr, dateStr];
  const wd = pyWeekday(d);
  const monday = new Date(d);
  monday.setDate(d.getDate() - wd);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [toIsoDate(monday), toIsoDate(sunday)];
}

export function formatDateLabel(dateStr: string): string {
  const d = parseIsoDateLocal(dateStr);
  if (!d) return dateStr;
  const wd = WEEKDAY_LABELS[pyWeekday(d)];
  const mo = MONTH_LABELS[d.getMonth() + 1];
  return `${wd}, ${d.getDate()} ${mo}`;
}

export function getOpenWeekdaysDescription(): string {
  const names = BUSINESS_CONFIG.open_weekdays.map((w) =>
    WEEKDAY_LABELS[w].toLowerCase()
  );
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names[0]} a ${names[names.length - 1]}`;
}

export function isValidSlotTime(timeStr: string): boolean {
  return getAllSlots().includes(timeStr);
}

