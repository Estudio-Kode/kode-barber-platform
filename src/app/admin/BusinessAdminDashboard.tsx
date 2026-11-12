"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type {
  BusinessScheduleRow,
  BusinessServiceRow,
} from "@/lib/supabase-server";

type SettingsData = {
  hours: BusinessScheduleRow[];
  services: BusinessServiceRow[];
};
type Section = "overview" | "agenda" | "services" | "hours";
type Appointment = {
  id: number;
  phone: string;
  service: string;
  date: string;
  time: string;
  name: string;
  created_at: string;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  price_cents: number | null;
  barber_id: string | null;
};
type DashboardSummary = {
  today: string;
  end_date: string;
  appointments: Appointment[];
  upcoming_appointments: Appointment[];
};
type AddonDraft = { name: string; price: string };
type ServiceDraft = {
  name: string;
  description: string;
  category: string;
  price: string;
  duration: string;
  directOnly: boolean;
  directContactUrl: string;
  addons: AddonDraft[];
  promotionLabel: string;
  promotionPrice: string;
  promotionStartsAt: string;
  promotionEndsAt: string;
};
type ScheduleDay = { open: boolean; openTime: string; closeTime: string };

const WEEKDAYS = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
  "Domingo",
];
const inputClass =
  "mt-1.5 w-full rounded-xl border border-white/10 bg-[#15171c] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400/70";
const labelClass = "block text-sm font-medium text-zinc-300";

async function requestJson<T>(
  url: string,
  method = "GET",
  body?: unknown
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || "Não foi possível concluir a operação.");
  }
  return data;
}

function parseCurrency(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function currencyInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function appointmentStatusLabel(
  status: Appointment["status"]
): string {
  const labels: Record<Appointment["status"], string> = {
    scheduled: "Agendado",
    completed: "Concluído",
    cancelled: "Cancelado",
    no_show: "Não compareceu",
  };
  return labels[status];
}

function datetimeLocalValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function datetimeToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function emptyDraft(): ServiceDraft {
  return {
    name: "",
    description: "",
    category: "",
    price: "",
    duration: "30",
    directOnly: false,
    directContactUrl: "",
    addons: [],
    promotionLabel: "",
    promotionPrice: "",
    promotionStartsAt: "",
    promotionEndsAt: "",
  };
}

function serviceToDraft(service: BusinessServiceRow): ServiceDraft {
  const promotion = service.promotions[0];
  return {
    name: service.name,
    description: service.description,
    category: service.category,
    price: currencyInput(service.price_cents),
    duration: String(service.duration_minutes),
    directOnly: service.direct_only,
    directContactUrl: service.direct_contact_url || "",
    addons: service.addons.map((addon) => ({
      name: addon.name,
      price: currencyInput(addon.price_cents),
    })),
    promotionLabel: promotion?.label || "",
    promotionPrice:
      promotion === undefined ? "" : currencyInput(promotion.price_cents),
    promotionStartsAt: datetimeLocalValue(promotion?.starts_at),
    promotionEndsAt: datetimeLocalValue(promotion?.ends_at),
  };
}

function scheduleToDays(hours: BusinessScheduleRow[]): Record<number, ScheduleDay> {
  const days: Record<number, ScheduleDay> = {};
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const saved = hours.find((item) => item.weekday === weekday);
    days[weekday] = saved
      ? {
          open: true,
          openTime: saved.open_time,
          closeTime: saved.close_time,
        }
      : { open: false, openTime: "09:00", closeTime: "18:00" };
  }
  return days;
}

export default function BusinessAdminDashboard({
  businessName,
  onLogout,
}: {
  businessName: string;
  onLogout: () => void;
}) {
  const [section, setSection] = useState<Section>("overview");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [dayAppointments, setDayAppointments] = useState<Appointment[]>([]);
  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [updatingAppointmentId, setUpdatingAppointmentId] = useState<number | null>(
    null
  );
  const [settings, setSettings] = useState<SettingsData>({
    hours: [],
    services: [],
  });
  const [days, setDays] = useState<Record<number, ScheduleDay>>(() =>
    scheduleToDays([])
  );
  const [draft, setDraft] = useState<ServiceDraft>(emptyDraft);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingHours, setSavingHours] = useState(false);
  const [savingService, setSavingService] = useState(false);
  const [removingServiceId, setRemovingServiceId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");

  const loadSettings = useCallback(async () => {
    const data = await requestJson<SettingsData>("/api/admin/settings");
    setSettings(data);
    setDays(scheduleToDays(data.hours));
  }, []);

  const loadSummary = useCallback(async () => {
    const data = await requestJson<DashboardSummary>("/api/admin/summary");
    setSummary(data);
    setSelectedDate((current) => current || data.today);
  }, []);

  const loadAgenda = useCallback(async (date: string) => {
    if (!date) return;
    setLoadingAgenda(true);
    try {
      const data = await requestJson<{
        appointments: Appointment[];
      }>(`/api/admin/appointments?date=${encodeURIComponent(date)}`);
      setDayAppointments(data.appointments);
    } finally {
      setLoadingAgenda(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      requestJson<SettingsData>("/api/admin/settings"),
      requestJson<DashboardSummary>("/api/admin/summary"),
    ])
      .then(([data, dashboardSummary]) => {
        if (!active) return;
        setSettings(data);
        setDays(scheduleToDays(data.hours));
        setSummary(dashboardSummary);
        setSelectedDate(dashboardSummary.today);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar as configurações."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const activeServices = useMemo(
    () => settings.services.filter((service) => service.active),
    [settings.services]
  );
  const openDayCount = settings.hours.length;
  const scheduledToday =
    summary?.appointments.filter(
      (appointment) =>
        appointment.date === summary.today && appointment.status === "scheduled"
    ) ?? [];
  const completedToday =
    summary?.appointments.filter(
      (appointment) =>
        appointment.date === summary.today && appointment.status === "completed"
    ).length ?? 0;
  const upcomingAppointments = summary?.upcoming_appointments ?? [];
  // Only appointments with a stored price contribute; older records may not have a price snapshot.
  const estimatedRevenueToday = scheduledToday.reduce(
    (total, appointment) => total + (appointment.price_cents ?? 0),
    0
  );
  const appointmentsWithPriceToday = scheduledToday.filter(
    (appointment) => appointment.price_cents !== null
  ).length;

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4000);
  }

  function navigateToSection(nextSection: Section) {
    setSection(nextSection);
    setError("");
    if (nextSection === "agenda" && selectedDate) {
      loadAgenda(selectedDate).catch((loadError: unknown) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar a agenda."
        )
      );
    }
  }

  async function updateAppointmentStatus(
    appointment: Appointment,
    status: "completed" | "cancelled" | "no_show"
  ) {
    const confirmation =
      status === "cancelled"
        ? `Cancelar o agendamento de ${appointment.name} às ${appointment.time}?`
        : status === "completed"
          ? `Marcar o atendimento de ${appointment.name} como concluído?`
          : `Marcar ${appointment.name} como não compareceu?`;
    if (!window.confirm(confirmation)) return;

    setUpdatingAppointmentId(appointment.id);
    setError("");
    try {
      await requestJson(
        `/api/admin/appointments/${appointment.id}`,
        "PATCH",
        { status }
      );
      await Promise.all([
        loadAgenda(selectedDate),
        loadSummary(),
      ]);
      showNotice(`Agendamento atualizado: ${appointmentStatusLabel(status)}.`);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Não foi possível atualizar o agendamento."
      );
    } finally {
      setUpdatingAppointmentId(null);
    }
  }

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const hours = Object.entries(days)
      .filter(([, day]) => day.open)
      .map(([weekday, day]) => ({
        weekday: Number(weekday),
        open_time: day.openTime,
        close_time: day.closeTime,
      }));
    setSavingHours(true);
    try {
      await requestJson("/api/admin/hours", "PUT", { hours });
      await loadSettings();
      showNotice("Horários de funcionamento salvos.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar os horários."
      );
    } finally {
      setSavingHours(false);
    }
  }

  function openNewServiceDialog() {
    setDraft(emptyDraft());
    setEditingServiceId(null);
    setFormError("");
    setServiceDialogOpen(true);
  }

  function openEditServiceDialog(service: BusinessServiceRow) {
    setDraft(serviceToDraft(service));
    setEditingServiceId(service.id);
    setFormError("");
    setServiceDialogOpen(true);
  }

  async function saveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const priceCents = parseCurrency(draft.price);
    if (priceCents === null) {
      setFormError("Informe um preço válido, com até duas casas decimais.");
      return;
    }
    const addonPayload = [];
    for (const addon of draft.addons) {
      const addonPrice = parseCurrency(addon.price);
      if (!addon.name.trim() || addonPrice === null) {
        setFormError("Preencha o nome e o preço de todos os adicionais.");
        return;
      }
      addonPayload.push({
        name: addon.name.trim(),
        price_cents: addonPrice,
      });
    }

    let promotion: {
      label: string;
      price_cents: number;
      starts_at: string | null;
      ends_at: string | null;
    } | null = null;
    if (
      draft.promotionLabel.trim() ||
      draft.promotionPrice ||
      draft.promotionStartsAt ||
      draft.promotionEndsAt
    ) {
      const promotionPrice = parseCurrency(draft.promotionPrice);
      if (!draft.promotionLabel.trim() || promotionPrice === null) {
        setFormError("Preencha o destaque e o preço da promoção.");
        return;
      }
      promotion = {
        label: draft.promotionLabel.trim(),
        price_cents: promotionPrice,
        starts_at: datetimeToIso(draft.promotionStartsAt),
        ends_at: datetimeToIso(draft.promotionEndsAt),
      };
      if (
        promotion.starts_at &&
        promotion.ends_at &&
        new Date(promotion.starts_at) >= new Date(promotion.ends_at)
      ) {
        setFormError("A data final da promoção deve ser posterior à inicial.");
        return;
      }
    }

    const duration = Number(draft.duration);
    if (!Number.isInteger(duration) || duration < 15 || duration > 480) {
      setFormError("A duração deve ser entre 15 e 480 minutos.");
      return;
    }

    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      category: draft.category.trim(),
      price_cents: priceCents,
      duration_minutes: duration,
      direct_only: draft.directOnly,
      direct_contact_url: draft.directContactUrl.trim() || null,
      active: true,
      addons: addonPayload,
      promotion,
    };
    setSavingService(true);
    setError("");
    try {
      await requestJson(
        editingServiceId
          ? `/api/admin/services/${editingServiceId}`
          : "/api/admin/services",
        editingServiceId ? "PUT" : "POST",
        payload
      );
      await loadSettings();
      setServiceDialogOpen(false);
      showNotice(
        editingServiceId ? "Serviço atualizado." : "Serviço cadastrado."
      );
    } catch (saveError) {
      setFormError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar o serviço."
      );
    } finally {
      setSavingService(false);
    }
  }

  async function removeService(service: BusinessServiceRow) {
    if (
      !window.confirm(
        `Remover "${service.name}" da página pública? Agendamentos antigos serão preservados.`
      )
    ) {
      return;
    }
    setRemovingServiceId(service.id);
    setError("");
    try {
      await requestJson(`/api/admin/services/${service.id}`, "DELETE");
      await loadSettings();
      showNotice("Serviço removido da página pública.");
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Não foi possível remover o serviço."
      );
    } finally {
      setRemovingServiceId("");
    }
  }

  function updateDraft<Key extends keyof ServiceDraft>(
    key: Key,
    value: ServiceDraft[Key]
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <main className="min-h-screen bg-[#0b0c0f] text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <aside className="hidden w-64 shrink-0 border-r border-white/6 bg-[#0e1014] px-5 py-6 lg:block">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-base font-black text-zinc-950">
              K
            </div>
            <div>
              <p className="text-sm font-bold tracking-[0.16em]">KODE</p>
              <p className="mt-0.5 text-[10px] tracking-[0.12em] text-zinc-500">
                PAINEL DA BARBEARIA
              </p>
            </div>
          </div>
          <nav aria-label="Navegação da barbearia" className="mt-10 space-y-1">
            {(
              [
                ["overview", "Visão geral"],
                ["agenda", "Agenda"],
                ["services", "Serviços"],
                ["hours", "Funcionamento"],
              ] as Array<[Section, string]>
            ).map(([key, title]) => (
              <button
                className={`w-full rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  section === key
                    ? "bg-amber-400/10 font-medium text-amber-200"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white"
                }`}
                key={key}
                onClick={() => navigateToSection(key)}
                type="button"
              >
                {title}
              </button>
            ))}
          </nav>
          <div className="mt-8 rounded-2xl border border-white/7 bg-white/[0.025] p-4">
            <p className="text-xs font-medium text-zinc-300">{businessName}</p>
            <p className="mt-1.5 text-xs leading-5 text-zinc-500">
              As alterações afetam somente esta barbearia.
            </p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-[74px] items-center justify-between border-b border-white/6 bg-[#0b0c0f]/90 px-5 backdrop-blur-xl sm:px-8">
            <div className="min-w-0">
              <p className="truncate text-xs text-zinc-500">{businessName}</p>
              <h1 className="mt-0.5 text-sm font-semibold text-zinc-100">
                Painel da barbearia
              </h1>
            </div>
            <button
              className="rounded-lg border border-white/8 px-3 py-2 text-xs font-medium text-zinc-400 transition hover:border-white/15 hover:text-white"
              onClick={onLogout}
              type="button"
            >
              Sair
            </button>
          </header>

          <nav
            aria-label="Navegação da barbearia"
            className="flex gap-2 overflow-x-auto border-b border-white/6 bg-[#0e1014] px-5 py-2 lg:hidden"
          >
            {(
              [
                ["overview", "Visão geral"],
                ["agenda", "Agenda"],
                ["services", "Serviços"],
                ["hours", "Funcionamento"],
              ] as Array<[Section, string]>
            ).map(([key, title]) => (
              <button
                className={`shrink-0 rounded-lg px-3 py-2 text-xs ${
                  section === key
                    ? "bg-amber-400/10 text-amber-200"
                    : "text-zinc-400"
                }`}
                key={key}
                onClick={() => navigateToSection(key)}
                type="button"
              >
                {title}
              </button>
            ))}
          </nav>

          <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
            <div className="mb-7">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
                Configurações
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                {section === "overview"
                  ? "Visão geral"
                  : section === "agenda"
                    ? "Agenda"
                  : section === "services"
                    ? "Serviços"
                    : "Funcionamento"}
              </h2>
              <p className="mt-2 text-sm text-zinc-500">
                {section === "overview"
                  ? "Acompanhe seus atendimentos e a operação da semana."
                  : section === "agenda"
                    ? "Consulte e atualize os agendamentos desta barbearia."
                  : section === "services"
                    ? "Defina preços, adicionais, promoções e formas de agendamento."
                    : "Configure individualmente os dias e horários de atendimento."}
              </p>
            </div>

            {notice && (
              <div className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                {notice}
              </div>
            )}
            {error && (
              <div className="mb-5 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            )}

            {loading ? (
              <div className="rounded-2xl border border-white/7 bg-[#111318] p-6 text-sm text-zinc-400">
                Carregando configurações...
              </div>
            ) : section === "overview" ? (
              <section>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    title: "Agendamentos hoje",
                    value: scheduledToday.length,
                    description: "Horários ainda previstos para hoje.",
                    action: "Abrir agenda",
                    target: "agenda" as Section,
                  },
                  {
                    title: "Concluídos hoje",
                    value: completedToday,
                    description: "Atendimentos marcados como concluídos.",
                    action: "Ver agenda",
                    target: "agenda" as Section,
                  },
                  {
                    title: "Próximos 7 dias",
                    value: upcomingAppointments.length,
                    description: "Agendamentos que ainda estão previstos.",
                    action: "Ver próximos horários",
                    target: "agenda" as Section,
                  },
                  {
                    title: "Receita prevista hoje",
                    value: formatCurrency(estimatedRevenueToday),
                    description:
                      "Soma dos preços registrados nos agendamentos de hoje.",
                    action: "Ver detalhes",
                    target: "agenda" as Section,
                  },
                ].map((card) => (
                  <article
                    className="rounded-2xl border border-white/7 bg-[#111318] p-5 sm:p-6"
                    key={card.title}
                  >
                    <p className="text-sm text-zinc-400">{card.title}</p>
                    <p className="mt-4 text-4xl font-semibold text-white">
                      {card.value}
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">
                      {card.description}
                    </p>
                    <button
                      className="mt-5 text-sm font-medium text-amber-300 hover:text-amber-200"
                      onClick={() => navigateToSection(card.target)}
                      type="button"
                    >
                      {card.action} →
                    </button>
                  </article>
                ))}
                </div>
                <p className="mt-3 text-xs text-zinc-600">
                  Preços antigos não registrados não entram na receita prevista
                  ({appointmentsWithPriceToday} de {scheduledToday.length} agendamentos de hoje têm valor salvo).
                </p>
                <section className="mt-6 rounded-2xl border border-white/7 bg-[#111318] p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-white">
                        Próximos atendimentos
                      </h3>
                      <p className="mt-1 text-xs text-zinc-500">
                        Agendamentos previstos para os próximos sete dias.
                      </p>
                    </div>
                    <button
                      className="text-sm font-medium text-amber-300 hover:text-amber-200"
                      onClick={() => navigateToSection("agenda")}
                      type="button"
                    >
                      Abrir agenda →
                    </button>
                  </div>
                  <div className="mt-4 divide-y divide-white/6">
                    {upcomingAppointments.slice(0, 5).map((appointment) => (
                      <div
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                        key={appointment.id}
                      >
                        <div>
                          <p className="text-sm font-medium text-zinc-200">
                            {appointment.name || "Cliente"}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {appointment.service}
                          </p>
                        </div>
                        <p className="text-xs text-zinc-400">
                          {formatShortDate(appointment.date)} · {appointment.time}
                        </p>
                      </div>
                    ))}
                    {upcomingAppointments.length === 0 && (
                      <p className="py-5 text-sm text-zinc-500">
                        Não há atendimentos agendados para os próximos sete dias.
                      </p>
                    )}
                  </div>
                </section>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button
                    className="rounded-xl border border-white/8 p-4 text-left transition hover:border-amber-300/20"
                    onClick={() => navigateToSection("services")}
                    type="button"
                  >
                    <span className="block text-sm font-medium text-zinc-200">
                      Serviços publicados
                    </span>
                    <span className="mt-1 block text-xs text-zinc-500">
                      {activeServices.length} serviços ativos na página pública.
                    </span>
                  </button>
                  <button
                    className="rounded-xl border border-white/8 p-4 text-left transition hover:border-amber-300/20"
                    onClick={() => navigateToSection("hours")}
                    type="button"
                  >
                    <span className="block text-sm font-medium text-zinc-200">
                      Dias de atendimento
                    </span>
                    <span className="mt-1 block text-xs text-zinc-500">
                      {openDayCount} dias configurados nesta semana.
                    </span>
                  </button>
                </div>
              </section>
            ) : section === "agenda" ? (
              <section>
                <div className="mb-5 flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-white/7 bg-[#111318] p-5">
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      Agendamentos por dia
                    </h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      Marque como concluído, não compareceu ou cancele.
                    </p>
                  </div>
                  <label className={`${labelClass} w-full sm:w-56`}>
                    Data
                    <input
                      className={inputClass}
                      max={summary?.end_date}
                      min={summary?.today}
                      onChange={(event) => {
                        const nextDate = event.target.value;
                        setSelectedDate(nextDate);
                        setError("");
                        loadAgenda(nextDate).catch((loadError: unknown) =>
                          setError(
                            loadError instanceof Error
                              ? loadError.message
                              : "Não foi possível carregar a agenda."
                          )
                        );
                      }}
                      type="date"
                      value={selectedDate}
                    />
                  </label>
                </div>
                {loadingAgenda ? (
                  <div className="rounded-2xl border border-white/7 bg-[#111318] p-6 text-sm text-zinc-400">
                    Carregando agendamentos...
                  </div>
                ) : dayAppointments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
                    <p className="text-sm font-medium text-zinc-300">
                      Nenhum agendamento neste dia
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Quando um cliente reservar um horário, ele aparecerá aqui.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dayAppointments.map((appointment) => (
                      <article
                        className="rounded-2xl border border-white/7 bg-[#111318] p-5"
                        key={appointment.id}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="flex min-w-0 gap-4">
                            <div className="flex h-14 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-amber-400/10 text-amber-200">
                              <span className="text-lg font-semibold">
                                {appointment.time}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-semibold text-white">
                                  {appointment.name || "Cliente"}
                                </h3>
                                <span
                                  className={`rounded-full px-2 py-1 text-[10px] ${
                                    appointment.status === "scheduled"
                                      ? "bg-amber-400/10 text-amber-200"
                                      : appointment.status === "completed"
                                        ? "bg-emerald-400/10 text-emerald-200"
                                        : appointment.status === "no_show"
                                          ? "bg-rose-400/10 text-rose-200"
                                          : "bg-white/6 text-zinc-400"
                                  }`}
                                >
                                  {appointmentStatusLabel(appointment.status)}
                                </span>
                              </div>
                              <p className="mt-1 text-sm text-zinc-300">
                                {appointment.service}
                              </p>
                              <p className="mt-1 text-xs text-zinc-500">
                                {appointment.phone}
                                {appointment.price_cents !== null &&
                                  ` · ${formatCurrency(appointment.price_cents)}`}
                              </p>
                            </div>
                          </div>
                          {appointment.status === "scheduled" && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                className="rounded-lg border border-emerald-300/15 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-300/[0.06] disabled:opacity-50"
                                disabled={updatingAppointmentId === appointment.id}
                                onClick={() =>
                                  updateAppointmentStatus(appointment, "completed")
                                }
                                type="button"
                              >
                                Concluído
                              </button>
                              <button
                                className="rounded-lg border border-rose-300/15 px-3 py-2 text-xs text-rose-200 hover:bg-rose-300/[0.06] disabled:opacity-50"
                                disabled={updatingAppointmentId === appointment.id}
                                onClick={() =>
                                  updateAppointmentStatus(appointment, "no_show")
                                }
                                type="button"
                              >
                                Não compareceu
                              </button>
                              <button
                                className="rounded-lg border border-white/8 px-3 py-2 text-xs text-zinc-400 hover:text-white disabled:opacity-50"
                                disabled={updatingAppointmentId === appointment.id}
                                onClick={() =>
                                  updateAppointmentStatus(appointment, "cancelled")
                                }
                                type="button"
                              >
                                Cancelar
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ) : section === "hours" ? (
              <form
                className="rounded-2xl border border-white/7 bg-[#111318] p-5 sm:p-7"
                onSubmit={saveSchedule}
              >
                <div className="mb-5">
                  <h3 className="text-base font-semibold text-white">
                    Horários gerais da barbearia
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    Ative os dias de atendimento e informe um intervalo para
                    cada dia. A grade pública disponibiliza horários em blocos
                    de 30 minutos.
                  </p>
                </div>
                <div className="divide-y divide-white/6">
                  {WEEKDAYS.map((weekdayName, weekday) => {
                    const day = days[weekday];
                    return (
                      <div
                        className="grid gap-3 py-4 sm:grid-cols-[minmax(150px,1fr)_1fr_1fr] sm:items-end"
                        key={weekdayName}
                      >
                        <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-200">
                          <input
                            checked={day.open}
                            className="h-4 w-4 accent-amber-400"
                            onChange={(event) =>
                              setDays((current) => ({
                                ...current,
                                [weekday]: {
                                  ...current[weekday],
                                  open: event.target.checked,
                                },
                              }))
                            }
                            type="checkbox"
                          />
                          {weekdayName}
                        </label>
                        <label className={`${labelClass} ${day.open ? "" : "opacity-40"}`}>
                          Abre
                          <input
                            className={inputClass}
                            disabled={!day.open}
                            onChange={(event) =>
                              setDays((current) => ({
                                ...current,
                                [weekday]: {
                                  ...current[weekday],
                                  openTime: event.target.value,
                                },
                              }))
                            }
                            required={day.open}
                            type="time"
                            value={day.openTime}
                          />
                        </label>
                        <label className={`${labelClass} ${day.open ? "" : "opacity-40"}`}>
                          Fecha
                          <input
                            className={inputClass}
                            disabled={!day.open}
                            onChange={(event) =>
                              setDays((current) => ({
                                ...current,
                                [weekday]: {
                                  ...current[weekday],
                                  closeTime: event.target.value,
                                },
                              }))
                            }
                            required={day.open}
                            type="time"
                            value={day.closeTime}
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-5 flex justify-end border-t border-white/6 pt-5">
                  <button
                    className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={savingHours}
                    type="submit"
                  >
                    {savingHours ? "Salvando..." : "Salvar funcionamento"}
                  </button>
                </div>
              </form>
            ) : (
              <section>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-zinc-500">
                    {activeServices.length}{" "}
                    {activeServices.length === 1
                      ? "serviço publicado"
                      : "serviços publicados"}
                  </p>
                  <button
                    className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
                    onClick={openNewServiceDialog}
                    type="button"
                  >
                    + Adicionar serviço
                  </button>
                </div>
                <div className="grid gap-3">
                  {activeServices.map((service) => (
                    <article
                      className="rounded-2xl border border-white/7 bg-[#111318] p-5"
                      key={service.id}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-white">
                              {service.name}
                            </h3>
                            {service.direct_only && (
                              <span className="rounded-full border border-indigo-300/15 bg-indigo-300/[0.06] px-2 py-1 text-[10px] text-indigo-200">
                                Agendamento direto
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">
                            {service.duration_minutes} min
                            {service.category ? ` · ${service.category}` : ""}
                            {service.description ? ` · ${service.description}` : ""}
                          </p>
                          {service.addons.length > 0 && (
                            <p className="mt-2 text-xs text-zinc-400">
                              Adicionais:{" "}
                              {service.addons
                                .map(
                                  (addon) =>
                                    `${addon.name} (${formatCurrency(addon.price_cents)})`
                                )
                                .join(", ")}
                            </p>
                          )}
                          {service.promotions[0] && (
                            <p className="mt-2 text-xs text-amber-300">
                              {service.promotions[0].label} ·{" "}
                              {formatCurrency(service.promotions[0].price_cents)}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-white">
                            {formatCurrency(service.price_cents)}
                          </p>
                          <div className="mt-3 flex gap-2">
                            <button
                              className="rounded-lg border border-white/8 px-3 py-2 text-xs text-zinc-300 hover:text-white"
                              onClick={() => openEditServiceDialog(service)}
                              type="button"
                            >
                              Editar
                            </button>
                            <button
                              className="rounded-lg border border-rose-300/15 px-3 py-2 text-xs text-rose-200 hover:bg-rose-300/[0.06] disabled:opacity-50"
                              disabled={removingServiceId === service.id}
                              onClick={() => removeService(service)}
                              type="button"
                            >
                              {removingServiceId === service.id
                                ? "Removendo..."
                                : "Remover"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                  {activeServices.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
                      <p className="text-sm font-medium text-zinc-300">
                        Nenhum serviço cadastrado
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Adicione os serviços para exibi-los na sua página pública.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      {serviceDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingService) {
              setServiceDialogOpen(false);
            }
          }}
        >
          <section
            aria-labelledby="service-dialog-title"
            aria-modal="true"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-[#101216] p-6 shadow-2xl sm:p-8"
            role="dialog"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
                  Catálogo da barbearia
                </p>
                <h2
                  className="mt-2 text-2xl font-semibold tracking-tight text-white"
                  id="service-dialog-title"
                >
                  {editingServiceId ? "Editar serviço" : "Novo serviço"}
                </h2>
              </div>
              <button
                aria-label="Fechar"
                className="rounded-lg px-2 py-1 text-xl text-zinc-500 hover:bg-white/5 hover:text-white"
                disabled={savingService}
                onClick={() => setServiceDialogOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>

            <form className="space-y-5" onSubmit={saveService}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>
                  Nome do serviço
                  <input
                    className={inputClass}
                    maxLength={80}
                    onChange={(event) => updateDraft("name", event.target.value)}
                    required
                    value={draft.name}
                  />
                </label>
                <label className={labelClass}>
                  Categoria <span className="font-normal text-zinc-500">· opcional</span>
                  <input
                    className={inputClass}
                    maxLength={50}
                    onChange={(event) =>
                      updateDraft("category", event.target.value)
                    }
                    value={draft.category}
                  />
                </label>
              </div>
              <label className={labelClass}>
                Descrição <span className="font-normal text-zinc-500">· opcional</span>
                <textarea
                  className={`${inputClass} min-h-20 resize-y`}
                  maxLength={300}
                  onChange={(event) =>
                    updateDraft("description", event.target.value)
                  }
                  value={draft.description}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>
                  Preço em R$
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    onChange={(event) => updateDraft("price", event.target.value)}
                    placeholder="Ex.: 45,00"
                    required
                    value={draft.price}
                  />
                </label>
                <label className={labelClass}>
                  Duração em minutos
                  <input
                    className={inputClass}
                    max="480"
                    min="15"
                    onChange={(event) =>
                      updateDraft("duration", event.target.value)
                    }
                    required
                    type="number"
                    value={draft.duration}
                  />
                </label>
              </div>

              <fieldset className="rounded-xl border border-white/8 p-4">
                <legend className="px-1 text-sm font-medium text-zinc-300">
                  Adicionais
                </legend>
                <div className="space-y-3">
                  {draft.addons.map((addon, index) => (
                    <div
                      className="grid gap-2 sm:grid-cols-[1fr_150px_auto]"
                      key={`addon-${index}`}
                    >
                      <input
                        aria-label={`Nome do adicional ${index + 1}`}
                        className={inputClass}
                        maxLength={60}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            addons: current.addons.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, name: event.target.value }
                                : item
                            ),
                          }))
                        }
                        placeholder="Ex.: Sobrancelha"
                        required
                        value={addon.name}
                      />
                      <input
                        aria-label={`Preço do adicional ${index + 1}`}
                        className={inputClass}
                        inputMode="decimal"
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            addons: current.addons.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, price: event.target.value }
                                : item
                            ),
                          }))
                        }
                        placeholder="Preço em R$"
                        required
                        value={addon.price}
                      />
                      <button
                        aria-label={`Remover adicional ${index + 1}`}
                        className="mt-1.5 rounded-lg border border-white/8 px-3 text-sm text-zinc-400 hover:text-white"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            addons: current.addons.filter(
                              (_, itemIndex) => itemIndex !== index
                            ),
                          }))
                        }
                        type="button"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="mt-3 text-xs font-medium text-amber-300 hover:text-amber-200 disabled:opacity-50"
                  disabled={draft.addons.length >= 10}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      addons: [...current.addons, { name: "", price: "" }],
                    }))
                  }
                  type="button"
                >
                  + Adicionar opção ({draft.addons.length}/10)
                </button>
              </fieldset>

              <fieldset className="rounded-xl border border-white/8 p-4">
                <legend className="px-1 text-sm font-medium text-zinc-300">
                  Promoção <span className="font-normal text-zinc-500">· opcional</span>
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={labelClass}>
                    Destaque no site
                    <input
                      className={inputClass}
                      maxLength={80}
                      onChange={(event) =>
                        updateDraft("promotionLabel", event.target.value)
                      }
                      placeholder="Ex.: Oferta da semana"
                      value={draft.promotionLabel}
                    />
                  </label>
                  <label className={labelClass}>
                    Preço promocional em R$
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      onChange={(event) =>
                        updateDraft("promotionPrice", event.target.value)
                      }
                      placeholder="Ex.: 35,00"
                      value={draft.promotionPrice}
                    />
                  </label>
                  <label className={labelClass}>
                    Início <span className="font-normal text-zinc-500">· opcional</span>
                    <input
                      className={inputClass}
                      onChange={(event) =>
                        updateDraft("promotionStartsAt", event.target.value)
                      }
                      type="datetime-local"
                      value={draft.promotionStartsAt}
                    />
                  </label>
                  <label className={labelClass}>
                    Término <span className="font-normal text-zinc-500">· opcional</span>
                    <input
                      className={inputClass}
                      onChange={(event) =>
                        updateDraft("promotionEndsAt", event.target.value)
                      }
                      type="datetime-local"
                      value={draft.promotionEndsAt}
                    />
                  </label>
                </div>
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  Deixe início e término vazios para uma promoção sem período
                  definido. O preço promocional será mostrado enquanto ela
                  estiver ativa.
                </p>
              </fieldset>

              <fieldset className="rounded-xl border border-white/8 p-4">
                <legend className="px-1 text-sm font-medium text-zinc-300">
                  Agendamento
                </legend>
                <label className="flex items-start gap-3 text-sm text-zinc-300">
                  <input
                    checked={draft.directOnly}
                    className="mt-0.5 accent-amber-400"
                    onChange={(event) =>
                      updateDraft("directOnly", event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>
                    Agendamento somente direto com a barbearia
                    <span className="mt-1 block text-xs text-zinc-500">
                      O serviço não terá horários online; a página mostrará um
                      link para contato.
                    </span>
                  </span>
                </label>
                {draft.directOnly && (
                  <label className={`${labelClass} mt-4`}>
                    Link do WhatsApp <span className="font-normal text-zinc-500">· opcional</span>
                    <input
                      className={inputClass}
                      onChange={(event) =>
                        updateDraft("directContactUrl", event.target.value)
                      }
                      placeholder="https://wa.me/5511999999999"
                      type="url"
                      value={draft.directContactUrl}
                    />
                    <span className="mt-1 block text-xs font-normal text-zinc-500">
                      Se ficar vazio, será usado o WhatsApp cadastrado para a
                      barbearia.
                    </span>
                  </label>
                )}
              </fieldset>

              {formError && (
                <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-300">
                  {formError}
                </p>
              )}
              <div className="flex justify-end gap-3 border-t border-white/8 pt-5">
                <button
                  className="rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-white"
                  disabled={savingService}
                  onClick={() => setServiceDialogOpen(false)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={savingService}
                  type="submit"
                >
                  {savingService
                    ? "Salvando..."
                    : editingServiceId
                      ? "Salvar alterações"
                      : "Cadastrar serviço"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
