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
  business_members?: Array<{
    login_email: string | null;
    role: "owner" | "manager" | "barber";
    active: boolean;
  }>;
}

export interface BusinessAdminAccess {
  user_id: string;
  business_id: string;
  login_email: string;
  must_change_password: boolean;
  business_name: string;
  business_slug: string;
  business_status: "setup" | "active" | "suspended";
}

export interface PublicBusinessService {
  id: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  duration_minutes: number;
  direct_only: boolean;
  direct_contact_url: string | null;
  sort_order: number;
  addons: Array<{ id: string; name: string; price_cents: number }>;
  promotions: Array<{
    label: string;
    price_cents: number;
    starts_at: string | null;
    ends_at: string | null;
  }>;
}

export interface PublicBusinessProfile {
  id: string;
  slug: string;
  name: string;
  whatsapp: string;
  logo_url: string | null;
  status: PlatformBusinessRow["status"];
  services: PublicBusinessService[];
  barbers: Array<{ id: string; name: string; photo_url: string | null }>;
  hours: Array<{
    barber_id: string | null;
    weekday: number;
    open_time: string;
    close_time: string;
  }>;
  barber_services: Array<{ barber_id: string; service_id: string }>;
}

export interface BusinessScheduleRow {
  weekday: number;
  open_time: string;
  close_time: string;
}

export interface BusinessServiceRow
  extends Omit<PublicBusinessService, "promotions"> {
  active: boolean;
  promotions: Array<{
    label: string;
    price_cents: number;
    starts_at: string | null;
    ends_at: string | null;
  }>;
}

interface SupabaseAuthUser {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
}

async function supabaseAuthRequest<T>(
  path: string,
  init?: RequestInit
): Promise<{ response: Response; data: T | null }> {
  const { url, secretKey } = getSupabaseEnv();
  const response = await fetch(`${url}/auth/v1/${path}`, {
    ...init,
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as T | null;
  return { response, data };
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

async function platformDbRpc<T>(
  functionName: string,
  parameters: Record<string, unknown>
): Promise<T> {
  const { url } = getSupabaseEnv();
  const response = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(parameters),
    cache: "no-store",
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Erro na operação da plataforma no Supabase: ${response.status} ${errorText}`
    );
  }
  return (await response.json()) as T;
}

export async function dbGetPlatformPlans(): Promise<PlatformPlanRow[]> {
  return platformDbRows<PlatformPlanRow>(
    "platform_plans?select=*&order=sort_order.asc,name.asc"
  );
}

export async function dbGetBusinessSettings(businessId: string): Promise<{
  hours: BusinessScheduleRow[];
  services: BusinessServiceRow[];
}> {
  const encodedBusinessId = encodeURIComponent(businessId);
  const [hours, services, addons, promotions] = await Promise.all([
    platformDbRows<{
      weekday: number;
      open_time: string;
      close_time: string;
    }>(
      `business_hours?business_id=eq.${encodedBusinessId}&barber_id=is.null&select=weekday,open_time,close_time&order=weekday.asc`
    ),
    platformDbRows<Omit<BusinessServiceRow, "addons" | "promotions">>(
      `business_services?business_id=eq.${encodedBusinessId}&select=id,name,description,category,price_cents,duration_minutes,direct_only,direct_contact_url,sort_order,active&order=sort_order.asc,name.asc`
    ),
    platformDbRows<{
      id: string;
      service_id: string;
      name: string;
      price_cents: number;
      active: boolean;
    }>(
      `service_addons?business_id=eq.${encodedBusinessId}&select=id,service_id,name,price_cents,active&order=sort_order.asc,name.asc`
    ),
    platformDbRows<{
      service_id: string;
      label: string;
      price_cents: number;
      starts_at: string | null;
      ends_at: string | null;
      active: boolean;
    }>(
      `service_promotions?business_id=eq.${encodedBusinessId}&select=service_id,label,price_cents,starts_at,ends_at,active`
    ),
  ]);
  return {
    hours: hours.map((row) => ({
      weekday: row.weekday,
      open_time: normalizeDbTime(row.open_time),
      close_time: normalizeDbTime(row.close_time),
    })),
    services: services.map((service) => ({
      ...service,
      addons: addons
        .filter((addon) => addon.service_id === service.id && addon.active)
        .map(({ id, name, price_cents }) => ({ id, name, price_cents })),
      promotions: promotions
        .filter(
          (promotion) =>
            promotion.service_id === service.id && promotion.active
        )
        .map(({ label, price_cents, starts_at, ends_at }) => ({
          label,
          price_cents,
          starts_at,
          ends_at,
        })),
    })),
  };
}

export async function dbSaveBusinessSchedule(
  businessId: string,
  hours: BusinessScheduleRow[]
): Promise<void> {
  await platformDbRpc<number>("replace_business_schedule", {
    p_business_id: businessId,
    p_hours: hours,
  });
}

export async function dbSaveBusinessService(input: {
  businessId: string;
  serviceId: string | null;
  service: {
    name: string;
    description: string;
    category: string;
    price_cents: number;
    duration_minutes: number;
    direct_only: boolean;
    direct_contact_url: string | null;
    active: boolean;
  };
  addons: Array<{ name: string; price_cents: number }>;
  promotion: {
    label: string;
    price_cents: number;
    starts_at: string | null;
    ends_at: string | null;
  } | null;
}): Promise<string> {
  return platformDbRpc<string>("save_business_service", {
    p_business_id: input.businessId,
    p_service_id: input.serviceId,
    p_service: input.service,
    p_addons: input.addons,
    p_promotion: input.promotion,
  });
}

export async function dbDeactivateBusinessService(
  businessId: string,
  serviceId: string
): Promise<boolean> {
  const rows = await platformDbRows<{ id: string }>(
    `business_services?id=eq.${encodeURIComponent(serviceId)}&business_id=eq.${encodeURIComponent(businessId)}&active=eq.true&select=id`,
    {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    }
  );
  return Boolean(rows[0]);
}

export async function dbGetPublicBusinessBySlug(
  slug: string
): Promise<PublicBusinessProfile | null> {
  const businesses = await platformDbRows<{
    id: string;
    slug: string;
    name: string;
    whatsapp: string;
    logo_url: string | null;
    status: PlatformBusinessRow["status"];
  }>(
    `businesses?slug=eq.${encodeURIComponent(slug)}&select=id,slug,name,whatsapp,logo_url,status&limit=1`
  );
  const business = businesses[0];
  if (!business) return null;

  const businessId = encodeURIComponent(business.id);
  const [serviceRows, addonRows, promotionRows, barbers, hours, barberServices] =
    await Promise.all([
      platformDbRows<Omit<PublicBusinessService, "addons" | "promotions">>(
        `business_services?business_id=eq.${businessId}&active=eq.true&select=id,name,description,category,price_cents,duration_minutes,direct_only,direct_contact_url,sort_order&order=sort_order.asc,name.asc`
      ),
      platformDbRows<{
        id: string;
        service_id: string;
        name: string;
        price_cents: number;
      }>(
        `service_addons?business_id=eq.${businessId}&active=eq.true&select=id,service_id,name,price_cents&order=sort_order.asc,name.asc`
      ),
      platformDbRows<{
        service_id: string;
        label: string;
        price_cents: number;
        starts_at: string | null;
        ends_at: string | null;
      }>(
        `service_promotions?business_id=eq.${businessId}&active=eq.true&select=service_id,label,price_cents,starts_at,ends_at`
      ),
      platformDbRows<{
        id: string;
        name: string;
        photo_url: string | null;
      }>(
        `barbers?business_id=eq.${businessId}&active=eq.true&select=id,name,photo_url&order=sort_order.asc,name.asc`
      ),
      platformDbRows<{
        barber_id: string | null;
        weekday: number;
        open_time: string;
        close_time: string;
      }>(
        `business_hours?business_id=eq.${businessId}&select=barber_id,weekday,open_time,close_time&order=weekday.asc,sort_order.asc`
      ),
      platformDbRows<{ barber_id: string; service_id: string }>(
        `barber_services?business_id=eq.${businessId}&select=barber_id,service_id`
      ),
    ]);

  return {
    ...business,
    services: serviceRows.map((service) => ({
      ...service,
      addons: addonRows
        .filter((addon) => addon.service_id === service.id)
        .map(({ id, name, price_cents }) => ({ id, name, price_cents })),
      promotions: promotionRows
        .filter((promotion) => promotion.service_id === service.id)
        .map(({ label, price_cents, starts_at, ends_at }) => ({
          label,
          price_cents,
          starts_at,
          ends_at,
        })),
    })),
    barbers,
    hours: hours.map((hour) => ({
      ...hour,
      open_time: normalizeDbTime(hour.open_time),
      close_time: normalizeDbTime(hour.close_time),
    })),
    barber_services: barberServices,
  };
}

export async function dbGetPublicBookingState(
  businessId: string,
  date: string
): Promise<{
  appointments: Array<{
    time: string;
    barber_id: string | null;
    service_id: string | null;
  }>;
  blocked_slots: Array<{ time: string; barber_id: string | null }>;
}> {
  const encodedBusinessId = encodeURIComponent(businessId);
  const [appointments, blockedSlots] = await Promise.all([
    platformDbRows<{
      time: string;
      barber_id: string | null;
      service_id: string | null;
    }>(
      `appointments?business_id=eq.${encodedBusinessId}&date=eq.${encodeURIComponent(date)}&status=eq.scheduled&select=time,barber_id,service_id`
    ),
    platformDbRows<{ time: string; barber_id: string | null }>(
      `blocked_slots?business_id=eq.${encodedBusinessId}&date=eq.${encodeURIComponent(date)}&select=time,barber_id`
    ),
  ]);
  return {
    appointments: appointments.map((item) => ({
      ...item,
      time: normalizeDbTime(item.time),
    })),
    blocked_slots: blockedSlots.map((item) => ({
      ...item,
      time: normalizeDbTime(item.time),
    })),
  };
}

export async function dbCountBusinessClientWeekAppointments(
  businessId: string,
  phone: string,
  monday: string,
  sunday: string
): Promise<number> {
  const rows = await platformDbRows<{ id: number }>(
    `appointments?business_id=eq.${encodeURIComponent(businessId)}&phone=eq.${encodeURIComponent(phone)}&and=(date.gte.${encodeURIComponent(monday)},date.lte.${encodeURIComponent(sunday)})&status=eq.scheduled&select=id`
  );
  return rows.length;
}

export async function dbCreatePublicAppointment(input: {
  businessId: string;
  phone: string;
  name: string;
  serviceId: string;
  serviceName: string;
  barberId: string | null;
  date: string;
  time: string;
  priceCents: number;
}): Promise<{ ok: true; id: number } | { ok: false }> {
  const { url } = getSupabaseEnv();
  const clientResponse = await fetch(
    `${url}/rest/v1/clients?on_conflict=business_id,phone`,
    {
      method: "POST",
      headers: buildHeaders({
        Prefer: "resolution=merge-duplicates,return=minimal",
      }),
      body: JSON.stringify({
        business_id: input.businessId,
        phone: input.phone,
        name: input.name,
        updated_at: new Date().toISOString(),
      }),
    }
  );
  if (!clientResponse.ok) {
    const errorText = await clientResponse.text();
    throw new Error(
      `Erro ao salvar cliente da barbearia: ${clientResponse.status} ${errorText}`
    );
  }

  const response = await fetch(
    `${url}/rest/v1/appointments`,
    {
      method: "POST",
      headers: buildHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify({
        business_id: input.businessId,
        phone: input.phone,
        service_id: input.serviceId,
        service: input.serviceName,
        barber_id: input.barberId,
        date: input.date,
        time: input.time,
        price_cents: input.priceCents,
      }),
    }
  );
  if (response.status === 409) return { ok: false };
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      code?: string;
    };
    if (error.code === "23505") return { ok: false };
    throw new Error(`Erro ao registrar agendamento: ${response.status}`);
  }
  const rows = (await response.json()) as Array<{ id: number }>;
  if (!rows[0]) {
    throw new Error("O Supabase não retornou o agendamento criado.");
  }
  return { ok: true, id: rows[0].id };
}

export async function dbGetPlatformBusinesses(): Promise<PlatformBusinessRow[]> {
  return platformDbRows<PlatformBusinessRow>(
    "businesses?select=id,slug,name,owner_name,email,whatsapp,logo_url,status,plan_id,plan_price_cents,created_at,updated_at,platform_plans(id,name,price_cents,max_barbers,features),business_members(login_email,role,active)&order=created_at.desc"
  );
}

export async function dbGetBusinessAdminAccess(
  businessId: string,
  userId: string
): Promise<BusinessAdminAccess | null> {
  const rows = await platformDbRows<{
    auth_user_id: string;
    business_id: string;
    login_email: string | null;
    must_change_password: boolean;
    businesses: {
      name: string;
      slug: string;
      status: BusinessAdminAccess["business_status"];
    };
  }>(
    `business_members?business_id=eq.${encodeURIComponent(businessId)}&auth_user_id=eq.${encodeURIComponent(userId)}&role=eq.owner&active=eq.true&select=auth_user_id,business_id,login_email,must_change_password,businesses!inner(name,slug,status)&limit=1`
  );
  const row = rows[0];
  if (!row?.login_email || !row.businesses) return null;
  return {
    user_id: row.auth_user_id,
    business_id: row.business_id,
    login_email: row.login_email,
    must_change_password: row.must_change_password,
    business_name: row.businesses.name,
    business_slug: row.businesses.slug,
    business_status: row.businesses.status,
  };
}

export async function dbGetBusinessAdminAccessesByUser(
  userId: string
): Promise<BusinessAdminAccess[]> {
  const rows = await platformDbRows<{
    auth_user_id: string;
    business_id: string;
    login_email: string | null;
    must_change_password: boolean;
    businesses: {
      name: string;
      slug: string;
      status: BusinessAdminAccess["business_status"];
    };
  }>(
    `business_members?auth_user_id=eq.${encodeURIComponent(userId)}&role=eq.owner&active=eq.true&select=auth_user_id,business_id,login_email,must_change_password,businesses!inner(name,slug,status)`
  );
  return rows.flatMap((row) =>
    row.login_email && row.businesses
      ? [
          {
            user_id: row.auth_user_id,
            business_id: row.business_id,
            login_email: row.login_email,
            must_change_password: row.must_change_password,
            business_name: row.businesses.name,
            business_slug: row.businesses.slug,
            business_status: row.businesses.status,
          },
        ]
      : []
  );
}

export async function dbProvisionBusinessAdmin(input: {
  businessId: string;
  email: string;
  password: string;
  fullName: string;
}): Promise<void> {
  const memberRows = await platformDbRows<{
    id: string;
    auth_user_id: string;
    login_email: string | null;
    must_change_password: boolean;
  }>(
    `business_members?business_id=eq.${encodeURIComponent(input.businessId)}&role=eq.owner&active=eq.true&select=id,auth_user_id,login_email,must_change_password&limit=1`
  );
  const existing = memberRows[0];

  if (existing) {
    const updatedMembers = await platformDbRows<{ id: string }>(
      `business_members?id=eq.${encodeURIComponent(existing.id)}&select=id`,
      {
        method: "PATCH",
        body: JSON.stringify({
          login_email: input.email,
          must_change_password: true,
        }),
      }
    );
    if (!updatedMembers[0]) {
      throw new Error("Não foi possível atualizar o acesso da barbearia.");
    }

    try {
      const { response, data } = await supabaseAuthRequest<SupabaseAuthUser>(
        `admin/users/${encodeURIComponent(existing.auth_user_id)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            email: input.email,
            password: input.password,
            email_confirm: true,
            user_metadata: {
              full_name: input.fullName,
              business_id: input.businessId,
            },
          }),
        }
      );
      if (!response.ok || !data?.id) {
        throw new Error(
          `SUPABASE_AUTH_${response.status}: não foi possível atualizar a conta Auth.`
        );
      }
    } catch (error) {
      await platformDbRows(
        `business_members?id=eq.${encodeURIComponent(existing.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            login_email: existing.login_email,
            must_change_password: existing.must_change_password,
          }),
        }
      );
      throw error;
    }
    return;
  }

  const { response, data } = await supabaseAuthRequest<{
    user?: SupabaseAuthUser;
    id?: string;
  }>("admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName,
        business_id: input.businessId,
      },
    }),
  });
  if (!response.ok) {
    const authError = data as { msg?: string; message?: string } | null;
    throw new Error(
      `SUPABASE_AUTH_${response.status}: ${authError?.msg || authError?.message || "Não foi possível criar a conta."}`
    );
  }
  const userId = data?.user?.id || data?.id;
  if (!userId) {
    throw new Error("O Supabase Auth não retornou o usuário criado.");
  }

  try {
    const memberships = await platformDbRows<{ id: string }>(
      "business_members?select=id",
      {
        method: "POST",
        body: JSON.stringify({
          business_id: input.businessId,
          auth_user_id: userId,
          login_email: input.email,
          must_change_password: true,
          role: "owner",
          active: true,
        }),
      }
    );
    if (!memberships[0]) {
      throw new Error("O Supabase não retornou o vínculo do administrador.");
    }
  } catch (error) {
    const rollback = await supabaseAuthRequest(
      `admin/users/${encodeURIComponent(userId)}`,
      { method: "DELETE" }
    );
    if (!rollback.response.ok) {
      throw new Error(
        `Não foi possível criar o vínculo e remover o usuário Auth criado (${rollback.response.status}).`
      );
    }
    throw error;
  }
}

export async function dbSignInBusinessAdmin(
  email: string,
  password: string
): Promise<SupabaseAuthUser | null> {
  const { response, data } = await supabaseAuthRequest<{
    user?: SupabaseAuthUser;
  }>("token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (response.status === 400 || response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`Falha no login do Supabase Auth (${response.status}).`);
  }
  return data?.user ?? null;
}

export async function dbChangeBusinessAdminPassword(input: {
  businessId: string;
  userId: string;
  password: string;
}): Promise<void> {
  const access = await dbGetBusinessAdminAccess(
    input.businessId,
    input.userId
  );
  if (!access || access.business_status === "suspended") {
    throw new Error("Acesso da barbearia indisponível.");
  }

  const { response } = await supabaseAuthRequest(
    `admin/users/${encodeURIComponent(input.userId)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        password: input.password,
        user_metadata: {
          business_id: input.businessId,
        },
      }),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Não foi possível atualizar a senha no Supabase Auth (${response.status}).`
    );
  }

  const rows = await platformDbRows<{ id: string }>(
    `business_members?business_id=eq.${encodeURIComponent(input.businessId)}&auth_user_id=eq.${encodeURIComponent(input.userId)}&role=eq.owner&select=id`,
    {
      method: "PATCH",
      body: JSON.stringify({ must_change_password: false }),
    }
  );
  if (!rows[0]) {
    throw new Error("Não foi possível concluir a ativação da nova senha.");
  }
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
  dateStr: string,
  businessId = LEGACY_BUSINESS_ID
): Promise<Array<{ id: number; phone: string; service: string; date: string; time: string; name: string; created_at: string }>> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/appointments?date=eq.${encodeURIComponent(
    dateStr
  )}&business_id=eq.${encodeURIComponent(businessId)}&select=id,phone,service,date,time,created_at,clients(name)&order=time.asc`;

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

export async function dbGetAllAppointments(
  businessId = LEGACY_BUSINESS_ID
): Promise<
  Array<{ id: number; phone: string; service: string; date: string; time: string; name: string; created_at: string }>
> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/appointments?business_id=eq.${encodeURIComponent(businessId)}&select=id,phone,service,date,time,created_at,clients(name)&order=date.asc,time.asc`;

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

export async function dbGetBlockedTimes(
  dateStr: string,
  businessId = LEGACY_BUSINESS_ID
): Promise<Set<string>> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/blocked_slots?date=eq.${encodeURIComponent(
    dateStr
  )}&business_id=eq.${encodeURIComponent(businessId)}&barber_id=is.null&select=time`;

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

export async function dbGetAppointmentById(
  id: number,
  businessId = LEGACY_BUSINESS_ID
): Promise<{
  id: number;
  phone: string;
  service: string;
  date: string;
  time: string;
  name: string;
} | null> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/appointments?id=eq.${id}&business_id=eq.${encodeURIComponent(businessId)}&select=id,phone,service,date,time,clients(name)`;

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

export async function dbDeleteAppointmentById(
  id: number,
  businessId = LEGACY_BUSINESS_ID
): Promise<void> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/appointments?id=eq.${id}&business_id=eq.${encodeURIComponent(businessId)}`;

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
  timeStr: string,
  businessId = LEGACY_BUSINESS_ID
): Promise<boolean> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/appointments?date=eq.${encodeURIComponent(
    dateStr
  )}&time=eq.${encodeURIComponent(timeStr)}&business_id=eq.${encodeURIComponent(businessId)}&select=id`;

  const res = await fetch(endpoint, {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Erro ao verificar agendamento existente: ${res.status} ${errText}`
    );
  }
  const rows: Array<{ id: number }> = await res.json();
  return rows.length > 0;
}

export async function dbBlockSlot(
  dateStr: string,
  timeStr: string,
  businessId = LEGACY_BUSINESS_ID
): Promise<void> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/blocked_slots?on_conflict=business_id,barber_id,date,time`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: buildHeaders({
      Prefer: "resolution=ignore-duplicates,return=minimal",
    }),
    body: JSON.stringify({
      business_id: businessId,
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

export async function dbUnblockSlot(
  dateStr: string,
  timeStr: string,
  businessId = LEGACY_BUSINESS_ID
): Promise<void> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/blocked_slots?date=eq.${encodeURIComponent(
    dateStr
  )}&time=eq.${encodeURIComponent(timeStr  )}&business_id=eq.${encodeURIComponent(businessId)}&barber_id=is.null`;

  const res = await fetch(endpoint, {
    method: "DELETE",
    headers: buildHeaders({ Prefer: "return=minimal" }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro ao desbloquear horário: ${res.status} ${errText}`);
  }
}

export async function dbGetDayNote(
  dateStr: string,
  businessId = LEGACY_BUSINESS_ID
): Promise<string> {
  const { url } = getSupabaseEnv();
  const endpoint = `${url}/rest/v1/day_notes?date=eq.${encodeURIComponent(
    dateStr
  )}&business_id=eq.${encodeURIComponent(businessId)}&select=note`;

  const res = await fetch(endpoint, {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro ao consultar observação: ${res.status} ${errText}`);
  }
  const rows: Array<{ note: string }> = await res.json();
  return rows[0]?.note ?? "";
}

export async function dbSaveDayNote(
  dateStr: string,
  note: string,
  businessId = LEGACY_BUSINESS_ID
): Promise<void> {
  const { url } = getSupabaseEnv();
  const cleaned = note.replace(/\x00/g, "").slice(0, 2000);

  if (!cleaned.trim()) {
    const delEndpoint = `${url}/rest/v1/day_notes?date=eq.${encodeURIComponent(
      dateStr
    )}&business_id=eq.${encodeURIComponent(businessId)}`;
    const res = await fetch(delEndpoint, {
      method: "DELETE",
      headers: buildHeaders({ Prefer: "return=minimal" }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Erro ao remover observação: ${res.status} ${errText}`);
    }
    return;
  }

  const endpoint = `${url}/rest/v1/day_notes?on_conflict=business_id,date`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: buildHeaders({
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({
      business_id: businessId,
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

