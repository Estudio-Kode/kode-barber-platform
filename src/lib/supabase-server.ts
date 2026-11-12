/**
 * Cliente REST para o PostgREST do Supabase usando a chave secreta (sb_secret_...).
 * Uso estritamente no servidor (Route Handlers / Server Components).
 * Nunca exposto ao navegador.
 */

function getSupabaseEnv() {
  const url = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const secretKey = (process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!url || !secretKey) {
    throw new Error(
      "SUPABASE_URL e SUPABASE_SECRET_KEY precisam estar configuradas no .env.local"
    );
  }
  return { url, secretKey };
}

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const { secretKey } = getSupabaseEnv();
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export const LEGACY_BUSINESS_ID = "11111111-1111-4111-8111-111111111111";

export type PlatformFeature =
  | "online_booking"
  | "multiple_barbers"
  | "advanced_reports"
  | "client_memberships"
  | "product_catalog";

export interface PlatformPlanRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  price_cents: number | null;
  max_barbers: number;
  max_services: number | null;
  max_products: number | null;
  features: Record<PlatformFeature, boolean>;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PlatformBusinessRow {
  id: string;
  slug: string;
  name: string;
  owner_name: string;
  email: string;
  whatsapp: string;
  logo_url: string | null;
  status: "setup" | "active" | "suspended";
  plan_id: string;
  plan_price_cents: number | null;
  created_at: string;
  updated_at: string;
  platform_plans: Pick<
    PlatformPlanRow,
    "id" | "name" | "price_cents" | "max_barbers" | "features"
  > | null;
}

async function platformDbRows<T>(
  endpoint: string,
  init?: RequestInit
): Promise<T[]> {
  const { url } = getSupabaseEnv();
  const response = await fetch(`${url}/rest/v1/${endpoint}`, {
    ...init,
    headers: buildHeaders({ Prefer: "return=representation" }),
    cache: "no-store",
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Erro na operação da plataforma no Supabase: ${response.status} ${errorText}`
    );
  }
  return (await response.json()) as T[];
}

export async function dbGetPlatformPlans(): Promise<PlatformPlanRow[]> {
  return platformDbRows<PlatformPlanRow>(
    "platform_plans?select=*&order=sort_order.asc,name.asc"
  );
}

export async function dbGetPlatformBusinesses(): Promise<PlatformBusinessRow[]> {
  return platformDbRows<PlatformBusinessRow>(
    "businesses?select=id,slug,name,owner_name,email,whatsapp,logo_url,status,plan_id,plan_price_cents,created_at,updated_at,platform_plans(id,name,price_cents,max_barbers,features)&order=created_at.desc"
  );
}

export async function dbCreatePlatformBusiness(input: {
  slug: string;
  name: string;
  owner_name: string;
  email: string;
  whatsapp: string;
  plan_id: string;
  plan_price_cents: number | null;
}): Promise<PlatformBusinessRow> {
  const rows = await platformDbRows<PlatformBusinessRow>(
    "businesses?select=id,slug,name,owner_name,email,whatsapp,logo_url,status,plan_id,plan_price_cents,created_at,updated_at",
    {
      method: "POST",
      body: JSON.stringify({ ...input, status: "setup" }),
    }
  );
  if (!rows[0]) throw new Error("O Supabase não retornou a barbearia criada.");
  return rows[0];
}

export async function dbUpdatePlatformBusiness(
  id: string,
  input: Partial<{
    slug: string;
    name: string;
    owner_name: string;
    email: string;
    whatsapp: string;
    status: PlatformBusinessRow["status"];
    plan_id: string;
    plan_price_cents: number | null;
  }>
): Promise<PlatformBusinessRow | null> {
  const rows = await platformDbRows<PlatformBusinessRow>(
    `businesses?id=eq.${encodeURIComponent(id)}&select=id,slug,name,owner_name,email,whatsapp,logo_url,status,plan_id,plan_price_cents,created_at,updated_at`,
    {
      method: "PATCH",
      body: JSON.stringify({ ...input, updated_at: new Date().toISOString() }),
    }
  );
  return rows[0] ?? null;
}

export async function dbCreatePlatformPlan(input: {
  slug: string;
  name: string;
  description: string;
  price_cents: number | null;
  max_barbers: number;
  max_services: number | null;
  max_products: number | null;
  features: Record<PlatformFeature, boolean>;
  sort_order: number;
}): Promise<PlatformPlanRow> {
  const rows = await platformDbRows<PlatformPlanRow>(
    "platform_plans?select=*",
    { method: "POST", body: JSON.stringify(input) }
  );
  if (!rows[0]) throw new Error("O Supabase não retornou o plano criado.");
  return rows[0];
}

export async function dbUpdatePlatformPlan(
  id: string,
  input: Partial<{
    slug: string;
    name: string;
    description: string;
    price_cents: number | null;
    max_barbers: number;
    max_services: number | null;
    max_products: number | null;
    features: Record<PlatformFeature, boolean>;
    active: boolean;
    sort_order: number;
  }>
): Promise<PlatformPlanRow | null> {
  const rows = await platformDbRows<PlatformPlanRow>(
    `platform_plans?id=eq.${encodeURIComponent(id)}&select=*`,
    {
      method: "PATCH",
      body: JSON.stringify({ ...input, updated_at: new Date().toISOString() }),
    }
  );
  return rows[0] ?? null;
}

export interface ClientRow {
  phone: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface AppointmentRow {
  id: number;
  phone: string;
  service: string;
  date: string;
  time: string; // no Postgres TIME vem como "HH:MM:SS", normalizamos para "HH:MM"
  created_at: string;
  clients?: { name: string } | null;
}

export interface BlockedSlotRow {
  id: number;
  date: string;
  time: string;
  created_at: string;
}

export interface DayNoteRow {
  date: string;
  note: string;
  updated_at: string;
}

export function normalizeDbTime(t: string): string {
  return (t || "").slice(0, 5);
}

export async function dbGetAppointmentsByDate(
  dateStr: string
): Promise<Array<{ id: number; phone: string; service: string; date: string; time: string; name: string; created_at: string }>> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/appointments?date=eq.${encodeURIComponent(
    dateStr
  )}&business_id=eq.${LEGACY_BUSINESS_ID}&select=id,phone,service,date,time,created_at,clients(name)&order=time.asc`;

  const res = await fetch(endpoint, {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro ao consultar agendamentos: ${res.status} ${errText}`);
  }
  const rows: AppointmentRow[] = await res.json();
  return rows.map((r) => ({
    id: r.id,
    phone: r.phone,
    service: r.service,
    date: r.date,
    time: normalizeDbTime(r.time),
    created_at: r.created_at,
    name: r.clients?.name ?? "",
  }));
}

export async function dbGetAllAppointments(): Promise<
  Array<{ id: number; phone: string; service: string; date: string; time: string; name: string; created_at: string }>
> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/appointments?business_id=eq.${LEGACY_BUSINESS_ID}&select=id,phone,service,date,time,created_at,clients(name)&order=date.asc,time.asc`;

  const res = await fetch(endpoint, {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro ao consultar todos agendamentos: ${res.status} ${errText}`);
  }
  const rows: AppointmentRow[] = await res.json();
  return rows.map((r) => ({
    id: r.id,
    phone: r.phone,
    service: r.service,
    date: r.date,
    time: normalizeDbTime(r.time),
    created_at: r.created_at,
    name: r.clients?.name ?? "",
  }));
}

export async function dbGetBlockedTimes(dateStr: string): Promise<Set<string>> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/blocked_slots?date=eq.${encodeURIComponent(
    dateStr
  )}&business_id=eq.${LEGACY_BUSINESS_ID}&barber_id=is.null&select=time`;

  const res = await fetch(endpoint, {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro ao consultar horários bloqueados: ${res.status} ${errText}`);
  }
  const rows: Array<{ time: string }> = await res.json();
  return new Set(rows.map((r) => normalizeDbTime(r.time)));
}

export async function dbCountClientWeekAppointments(
  phone: string,
  mondayIso: string,
  sundayIso: string
): Promise<number> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/appointments?phone=eq.${encodeURIComponent(
    phone
  )}&business_id=eq.${LEGACY_BUSINESS_ID}&and=(date.gte.${encodeURIComponent(mondayIso)},date.lte.${encodeURIComponent(
    sundayIso
  )})&select=id`;

  const res = await fetch(endpoint, {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro ao contar agendamentos da semana: ${res.status} ${errText}`);
  }
  const rows: Array<{ id: number }> = await res.json();
  return rows.length;
}

export async function dbUpsertClient(phone: string, name: string): Promise<void> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/clients?on_conflict=business_id,phone`;
  const nowIso = new Date().toISOString();

  const res = await fetch(endpoint, {
    method: "POST",
    headers: buildHeaders({
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({
      business_id: LEGACY_BUSINESS_ID,
      phone,
      name,
      updated_at: nowIso,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro ao salvar cliente: ${res.status} ${errText}`);
  }
}

export async function dbInsertAppointment(params: {
  phone: string;
  service: string;
  date: string;
  time: string;
}): Promise<{ ok: true; id: number } | { ok: false; conflict: boolean; message: string }> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/appointments`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: buildHeaders({
      Prefer: "return=representation",
    }),
    body: JSON.stringify({
      business_id: LEGACY_BUSINESS_ID,
      phone: params.phone,
      service: params.service,
      date: params.date,
      time: params.time,
    }),
  });

  if (res.status === 409) {
    return {
      ok: false,
      conflict: true,
      message: "Ops! Este horário acabou de ser ocupado. Escolha outro.",
    };
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    if (errBody?.code === "23505") {
      return {
        ok: false,
        conflict: true,
        message: "Ops! Este horário acabou de ser ocupado. Escolha outro.",
      };
    }
    return {
      ok: false,
      conflict: false,
      message: errBody?.message || "Erro ao registrar agendamento.",
    };
  }

  const rows: AppointmentRow[] = await res.json();
  return { ok: true, id: rows[0]?.id ?? 0 };
}

export async function dbGetAppointmentById(id: number): Promise<{
  id: number;
  phone: string;
  service: string;
  date: string;
  time: string;
  name: string;
} | null> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/appointments?id=eq.${id}&business_id=eq.${LEGACY_BUSINESS_ID}&select=id,phone,service,date,time,clients(name)`;

  const res = await fetch(endpoint, {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const rows: AppointmentRow[] = await res.json();
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id,
    phone: r.phone,
    service: r.service,
    date: r.date,
    time: normalizeDbTime(r.time),
    name: r.clients?.name ?? "",
  };
}

export async function dbDeleteAppointmentById(id: number): Promise<void> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/appointments?id=eq.${id}&business_id=eq.${LEGACY_BUSINESS_ID}`;

  const res = await fetch(endpoint, {
    method: "DELETE",
    headers: buildHeaders({ Prefer: "return=minimal" }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro ao remover agendamento: ${res.status} ${errText}`);
  }
}

export async function dbHasAppointmentAt(
  dateStr: string,
  timeStr: string
): Promise<boolean> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/appointments?date=eq.${encodeURIComponent(
    dateStr
  )}&time=eq.${encodeURIComponent(timeStr)}&business_id=eq.${LEGACY_BUSINESS_ID}&select=id`;

  const res = await fetch(endpoint, {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return false;
  const rows: Array<{ id: number }> = await res.json();
  return rows.length > 0;
}

export async function dbBlockSlot(dateStr: string, timeStr: string): Promise<void> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/blocked_slots?on_conflict=business_id,barber_id,date,time`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: buildHeaders({
      Prefer: "resolution=ignore-duplicates,return=minimal",
    }),
    body: JSON.stringify({
      business_id: LEGACY_BUSINESS_ID,
      barber_id: null,
      date: dateStr,
      time: timeStr,
    }),
  });
  if (!res.ok && res.status !== 409) {
    const errText = await res.text();
    throw new Error(`Erro ao bloquear horário: ${res.status} ${errText}`);
  }
}

export async function dbUnblockSlot(dateStr: string, timeStr: string): Promise<void> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/blocked_slots?date=eq.${encodeURIComponent(
    dateStr
  )}&time=eq.${encodeURIComponent(timeStr)}&business_id=eq.${LEGACY_BUSINESS_ID}&barber_id=is.null`;

  const res = await fetch(endpoint, {
    method: "DELETE",
    headers: buildHeaders({ Prefer: "return=minimal" }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro ao desbloquear horário: ${res.status} ${errText}`);
  }
}

export async function dbGetDayNote(dateStr: string): Promise<string> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/day_notes?date=eq.${encodeURIComponent(
    dateStr
  )}&business_id=eq.${LEGACY_BUSINESS_ID}&select=note`;

  const res = await fetch(endpoint, {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return "";
  const rows: Array<{ note: string }> = await res.json();
  return rows[0]?.note ?? "";
}

export async function dbSaveDayNote(dateStr: string, note: string): Promise<void> {
  const { url } = getSupabaseEnv();
  const cleaned = note.replace(/\x00/g, "").slice(0, 2000);

  if (!cleaned.trim()) {
    const delEndpoint = `${url}/rest/v1/day_notes?date=eq.${encodeURIComponent(
      dateStr
    )}&business_id=eq.${LEGACY_BUSINESS_ID}`;
    await fetch(delEndpoint, {
      method: "DELETE",
      headers: buildHeaders({ Prefer: "return=minimal" }),
    });
    return;
  }

  const endpoint = `${url}/rest/v1/day_notes?on_conflict=business_id,date`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: buildHeaders({
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({
      business_id: LEGACY_BUSINESS_ID,
      date: dateStr,
      note: cleaned,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro ao salvar observação: ${res.status} ${errText}`);
  }
}

