import { NextRequest, NextResponse } from "next/server";
import { BUSINESS_CONFIG, getServiceByName } from "@/config/business";
import { getClientIp } from "@/lib/auth";
import {
  MAX_NAME_LEN,
  getOpenWeekdaysDescription,
  getWeekBounds,
  isValidBookingDate,
  isValidSlotTime,
  normalizePhone,
  sanitizeText,
  slotIsPast,
  slotWithinCutoff,
} from "@/lib/domain";
import {
  isBookingRateLimited,
  readSafeJson,
  recordBookingAttempt,
} from "@/lib/request-guard";
import {
  dbCountClientWeekAppointments,
  dbGetBlockedTimes,
  dbInsertAppointment,
  dbUpsertClient,
} from "@/lib/supabase-server";
import { notifyNewBooking } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isBookingRateLimited(ip)) {
    return NextResponse.json(
      {
        error:
          "Muitas tentativas seguidas. Aguarde alguns minutos ou chame no WhatsApp.",
      },
      { status: 429 }
    );
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
  const rawService = typeof data.service === "string" ? data.service.trim() : "";
  const sobrancelha = Boolean(data.sobrancelha);
  const confirmWeek = Boolean(data.confirm_week);
  const dateStr = typeof data.date === "string" ? data.date.trim() : "";
  const timeStr = typeof data.time === "string" ? data.time.trim() : "";

  if (!name || name.length < 2) {
    return NextResponse.json(
      { error: "Informe um nome válido." },
      { status: 400 }
    );
  }
  if (phone.length < 10 || phone.length > 11) {
    return NextResponse.json(
      { error: "Telefone inválido. Use DDD + número." },
      { status: 400 }
    );
  }

  const svcObj = getServiceByName(rawService);
  if (!svcObj) {
    return NextResponse.json({ error: "Serviço inválido." }, { status: 400 });
  }
  if (BUSINESS_CONFIG.direct_services.includes(rawService)) {
    return NextResponse.json(
      { error: "Este serviço deve ser combinado direto com o barbeiro." },
      { status: 400 }
    );
  }

  let finalService = rawService;
  if (sobrancelha) {
    if (!svcObj.addon_sobrancelha) {
      return NextResponse.json(
        { error: "Este serviço não permite adicionar sobrancelha." },
        { status: 400 }
      );
    }
    finalService = `${rawService} + Sobrancelha`;
  }

  if (!isValidBookingDate(dateStr)) {
    const daysDesc = getOpenWeekdaysDescription();
    return NextResponse.json(
      {
        error: `Data fora do período permitido (${daysDesc}, até ${BUSINESS_CONFIG.max_days_ahead} dias).`,
      },
      { status: 400 }
    );
  }

  if (!isValidSlotTime(timeStr)) {
    return NextResponse.json({ error: "Horário inválido." }, { status: 400 });
  }

  if (slotIsPast(dateStr, timeStr)) {
    return NextResponse.json(
      { error: "Este horário já passou." },
      { status: 400 }
    );
  }

  if (slotWithinCutoff(dateStr, timeStr)) {
    const cutoff = BUSINESS_CONFIG.booking_cutoff_minutes ?? 30;
    return NextResponse.json(
      {
        error: `O tempo limite para marcar este horário pelo site foi atingido (menos de ${cutoff} minutos de antecedência). Combine direto com o barbeiro pelo WhatsApp.`,
        code: "cutoff",
      },
      { status: 403 }
    );
  }

  try {
    // 1. Verifica se está bloqueado pelo admin
    const blockedSet = await dbGetBlockedTimes(dateStr);
    if (blockedSet.has(timeStr)) {
      return NextResponse.json(
        {
          error: "Este horário não está disponível. Escolha outro.",
          code: "blocked",
        },
        { status: 409 }
      );
    }

    // 2. Verifica limite semanal
    const weekLimit = BUSINESS_CONFIG.week_booking_limit ?? 1;
    if (weekLimit > 0 && !confirmWeek) {
      const [monday, sunday] = getWeekBounds(dateStr);
      const count = await dbCountClientWeekAppointments(phone, monday, sunday);
      if (count >= weekLimit) {
        return NextResponse.json(
          {
            error: "Você já tem um horário marcado nesta semana.",
            code: "week_limit",
          },
          { status: 409 }
        );
      }
    }

    recordBookingAttempt(ip);

    // 3. Registra/atualiza o cliente primeiro (FK em appointments -> clients.phone)
    await dbUpsertClient(phone, name);

    // 4. Insere o agendamento (constraint UNIQUE(date, time) garante atomicidade)
    const inserted = await dbInsertAppointment({
      phone,
      service: finalService,
      date: dateStr,
      time: timeStr,
    });

    if (!inserted.ok) {
      return NextResponse.json(
        { error: inserted.message },
        { status: inserted.conflict ? 409 : 500 }
      );
    }

    notifyNewBooking({
      name,
      phone,
      service: finalService,
      date: dateStr,
      time: timeStr,
    });

    return NextResponse.json(
      {
        ok: true,
        appointment: {
          id: inserted.id,
          name,
          phone,
          service: finalService,
          date: dateStr,
          time: timeStr,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/appointments]", err);
    return NextResponse.json(
      { error: "Erro interno ao registrar agendamento." },
      { status: 500 }
    );
  }
}
