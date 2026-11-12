import { NextRequest, NextResponse } from "next/server";
import { BUSINESS_CONFIG } from "@/config/business";
import { getClientIp } from "@/lib/auth";
import {
  getCurrentServicePrice,
  getPublicAvailableTimes,
  resolveBookingBarber,
} from "@/lib/public-booking";
import {
  getWeekBounds,
  MAX_NAME_LEN,
  normalizePhone,
  parseIsoDateLocal,
  sanitizeText,
} from "@/lib/domain";
import {
  dbCountBusinessClientWeekAppointments,
  dbCreatePublicAppointment,
  dbGetPublicBookingState,
  dbGetPublicBusinessBySlug,
} from "@/lib/supabase-server";
import {
  isBookingRateLimited,
  readSafeJson,
  recordBookingAttempt,
} from "@/lib/request-guard";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const ip = getClientIp(req);
  if (isBookingRateLimited(ip)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    );
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json({ error: "Barbearia não encontrada." }, { status: 404 });
  }

  const parsed = await readSafeJson(req);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status }
    );
  }
  const data = parsed.data;
  const name = sanitizeText(data.name, MAX_NAME_LEN);
  const phone = normalizePhone(data.phone);
  const serviceId = typeof data.service_id === "string" ? data.service_id : "";
  const requestedBarberId =
    typeof data.barber_id === "string" && data.barber_id
      ? data.barber_id
      : null;
  const date = typeof data.date === "string" ? data.date.trim() : "";
  const time = typeof data.time === "string" ? data.time.trim() : "";
  const rawAddonIds = data.addon_ids;
  const addonIds = Array.isArray(rawAddonIds)
    ? rawAddonIds.filter((id): id is string => typeof id === "string")
    : [];

  if (name.length < 2) {
    return NextResponse.json({ error: "Informe seu nome." }, { status: 400 });
  }
  if (phone.length < 10 || phone.length > 11) {
    return NextResponse.json(
      { error: "Informe um telefone válido com DDD." },
      { status: 400 }
    );
  }
  if (
    (data.barber_id !== undefined &&
      data.barber_id !== null &&
      typeof data.barber_id !== "string") ||
    (rawAddonIds !== undefined &&
      (!Array.isArray(rawAddonIds) ||
        rawAddonIds.some((id) => typeof id !== "string"))) ||
    !UUID_PATTERN.test(serviceId) ||
    (requestedBarberId && !UUID_PATTERN.test(requestedBarberId)) ||
    addonIds.length > 10 ||
    addonIds.some((id) => !UUID_PATTERN.test(id)) ||
    new Set(addonIds).size !== addonIds.length
  ) {
    return NextResponse.json(
      { error: "Confira o serviço, barbeiro e adicionais selecionados." },
      { status: 400 }
    );
  }
  if (!parseIsoDateLocal(date) || !TIME_PATTERN.test(time)) {
    return NextResponse.json(
      { error: "Data ou horário inválido." },
      { status: 400 }
    );
  }

  try {
    const profile = await dbGetPublicBusinessBySlug(slug);
    if (!profile || profile.status !== "active") {
      return NextResponse.json(
        { error: "O agendamento desta barbearia não está disponível." },
        { status: 404 }
      );
    }

    const service = profile.services.find((item) => item.id === serviceId);
    if (!service || service.direct_only) {
      return NextResponse.json(
        { error: "Este serviço não pode ser agendado online." },
        { status: 400 }
      );
    }
    const barberId = resolveBookingBarber(
      profile,
      serviceId,
      requestedBarberId
    );
    if (barberId === undefined) {
      return NextResponse.json(
        { error: "Selecione um barbeiro disponível para este serviço." },
        { status: 400 }
      );
    }

    const addons = service.addons.filter((addon) =>
      addonIds.includes(addon.id)
    );
    if (addons.length !== addonIds.length) {
      return NextResponse.json(
        { error: "Um dos adicionais não pertence a este serviço." },
        { status: 400 }
      );
    }

    const state = await dbGetPublicBookingState(profile.id, date);
    const times = getPublicAvailableTimes(
      profile,
      service,
      barberId,
      date,
      state
    );
    if (!times.includes(time)) {
      return NextResponse.json(
        { error: "Este horário acabou de ficar indisponível. Escolha outro." },
        { status: 409 }
      );
    }

    const weekLimit = BUSINESS_CONFIG.week_booking_limit;
    if (weekLimit > 0) {
      const [monday, sunday] = getWeekBounds(date);
      const existingCount = await dbCountBusinessClientWeekAppointments(
        profile.id,
        phone,
        monday,
        sunday
      );
      if (existingCount >= weekLimit) {
        return NextResponse.json(
          { error: "Você já possui um agendamento nesta semana." },
          { status: 409 }
        );
      }
    }

    const addonNames = addons.map((addon) => addon.name);
    const serviceName = [service.name, ...addonNames].join(" + ");
    const priceCents =
      getCurrentServicePrice(service) +
      addons.reduce((total, addon) => total + addon.price_cents, 0);

    recordBookingAttempt(ip);
    const inserted = await dbCreatePublicAppointment({
      businessId: profile.id,
      phone,
      name,
      serviceId,
      serviceName,
      barberId,
      date,
      time,
      priceCents,
    });
    if (!inserted.ok) {
      return NextResponse.json(
        { error: "Este horário acabou de ser reservado. Escolha outro." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        appointment: {
          id: inserted.id,
          business: profile.name,
          name,
          service: serviceName,
          date,
          time,
          price_cents: priceCents,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/public/businesses/:slug/appointments]", error);
    return NextResponse.json(
      { error: "Não foi possível registrar o agendamento. Tente novamente." },
      { status: 500 }
    );
  }
}
