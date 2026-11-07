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
  )}&select=id,phone,service,date,time,created_at,clients(name)&order=time.asc`;

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
  const endpoint = `${url}/rest/v1/appointments?select=id,phone,service,date,time,created_at,clients(name)&order=date.asc,time.asc`;

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
  )}&select=time`;

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
  )}&and=(date.gte.${encodeURIComponent(mondayIso)},date.lte.${encodeURIComponent(
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
  const endpoint = `${url}/rest/v1/clients?on_conflict=phone`;
  const nowIso = new Date().toISOString();

  const res = await fetch(endpoint, {
    method: "POST",
    headers: buildHeaders({
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({
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
  const endpoint = `${url}/rest/v1/appointments?id=eq.${id}&select=id,phone,service,date,time,clients(name)`;

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
  const endpoint = `${url}/rest/v1/appointments?id=eq.${id}`;

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
  )}&time=eq.${encodeURIComponent(timeStr)}&select=id`;

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
  const endpoint = `${url}/rest/v1/blocked_slots?on_conflict=date,time`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: buildHeaders({
      Prefer: "resolution=ignore-duplicates,return=minimal",
    }),
    body: JSON.stringify({
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
  )}&time=eq.${encodeURIComponent(timeStr)}`;

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
  )}&select=note`;

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
    )}`;
    await fetch(delEndpoint, {
      method: "DELETE",
      headers: buildHeaders({ Prefer: "return=minimal" }),
    });
    return;
  }

  const endpoint = `${url}/rest/v1/day_notes?on_conflict=date`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: buildHeaders({
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({
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

