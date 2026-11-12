import { sanitizeText } from "@/lib/domain";
import {
  BusinessScheduleRow,
  BusinessServiceRow,
} from "@/lib/supabase-server";

export interface BusinessServiceInput {
  name: string;
  description: string;
  category: string;
  price_cents: number;
  duration_minutes: number;
  direct_only: boolean;
  direct_contact_url: string | null;
  active: boolean;
  addons: Array<{ name: string; price_cents: number }>;
  promotion: {
    label: string;
    price_cents: number;
    starts_at: string | null;
    ends_at: string | null;
  } | null;
}

export function parseBusinessSchedule(
  value: unknown
): { hours: BusinessScheduleRow[] } | { error: string } {
  if (!Array.isArray(value) || value.length > 7) {
    return { error: "Informe os horários de funcionamento da semana." };
  }
  const weekdays = new Set<number>();
  const hours: BusinessScheduleRow[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { error: "Um dos dias informados é inválido." };
    }
    const row = item as Record<string, unknown>;
    const weekday = row.weekday;
    const openTime = row.open_time;
    const closeTime = row.close_time;
    if (
      typeof weekday !== "number" ||
      !Number.isInteger(weekday) ||
      weekday < 0 ||
      weekday > 6 ||
      weekdays.has(weekday)
    ) {
      return { error: "Cada dia da semana deve aparecer apenas uma vez." };
    }
    if (
      typeof openTime !== "string" ||
      typeof closeTime !== "string" ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(openTime) ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(closeTime) ||
      openTime >= closeTime
    ) {
      return { error: "Confira o horário de abertura e fechamento de cada dia." };
    }
    weekdays.add(weekday);
    hours.push({
      weekday,
      open_time: openTime,
      close_time: closeTime,
    });
  }
  return { hours: hours.sort((a, b) => a.weekday - b.weekday) };
}

function isOptionalIsoDate(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value.length <= 40 &&
      Number.isFinite(Date.parse(value)))
  );
}

export function parseBusinessService(
  value: Record<string, unknown>,
  current?: BusinessServiceRow
): { service: Omit<BusinessServiceInput, "addons" | "promotion">; addons: BusinessServiceInput["addons"]; promotion: BusinessServiceInput["promotion"] } | { error: string } {
  const name = sanitizeText(value.name, 80);
  const description = sanitizeText(value.description, 300);
  const category = sanitizeText(value.category, 50);
  const price = value.price_cents;
  const duration = value.duration_minutes;
  const directOnly = value.direct_only;
  const active = value.active === undefined ? current?.active ?? true : value.active;
  const contactUrl =
    typeof value.direct_contact_url === "string"
      ? value.direct_contact_url.trim()
      : "";

  if (name.length < 2) {
    return { error: "O nome do serviço deve ter pelo menos 2 caracteres." };
  }
  if (
    typeof price !== "number" ||
    !Number.isInteger(price) ||
    price < 0 ||
    price > 100_000_000
  ) {
    return { error: "Informe um preço válido para o serviço." };
  }
  if (
    typeof duration !== "number" ||
    !Number.isInteger(duration) ||
    duration < 15 ||
    duration > 480
  ) {
    return { error: "A duração deve ser um número entre 15 e 480 minutos." };
  }
  if (typeof directOnly !== "boolean" || typeof active !== "boolean") {
    return { error: "Confira as opções de agendamento do serviço." };
  }
  if (contactUrl) {
    try {
      const url = new URL(contactUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return { error: "O link de contato deve começar com http:// ou https://." };
      }
    } catch {
      return { error: "Informe um link de contato válido." };
    }
  }

  const rawAddons = value.addons;
  if (!Array.isArray(rawAddons) || rawAddons.length > 10) {
    return { error: "Um serviço pode ter até 10 adicionais." };
  }
  const addonNames = new Set<string>();
  const addons: BusinessServiceInput["addons"] = [];
  for (const item of rawAddons) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { error: "Um dos adicionais informados é inválido." };
    }
    const addon = item as Record<string, unknown>;
    const addonName = sanitizeText(addon.name, 60);
    const addonPrice = addon.price_cents;
    const normalizedName = addonName.toLocaleLowerCase("pt-BR");
    if (!addonName || addonNames.has(normalizedName)) {
      return { error: "Os nomes dos adicionais devem ser únicos." };
    }
    if (
      typeof addonPrice !== "number" ||
      !Number.isInteger(addonPrice) ||
      addonPrice < 0 ||
      addonPrice > 100_000_000
    ) {
      return { error: `Informe um preço válido para o adicional ${addonName}.` };
    }
    addonNames.add(normalizedName);
    addons.push({ name: addonName, price_cents: addonPrice });
  }

  let promotion: BusinessServiceInput["promotion"] = null;
  if (value.promotion !== undefined && value.promotion !== null) {
    if (
      typeof value.promotion !== "object" ||
      Array.isArray(value.promotion)
    ) {
      return { error: "Os dados da promoção são inválidos." };
    }
    const rawPromotion = value.promotion as Record<string, unknown>;
    const label = sanitizeText(rawPromotion.label, 80);
    const promotionPrice = rawPromotion.price_cents;
    const startsAt = rawPromotion.starts_at;
    const endsAt = rawPromotion.ends_at;
    if (
      !label ||
      typeof promotionPrice !== "number" ||
      !Number.isInteger(promotionPrice) ||
      promotionPrice < 0 ||
      promotionPrice > 100_000_000 ||
      !isOptionalIsoDate(startsAt) ||
      !isOptionalIsoDate(endsAt)
    ) {
      return { error: "Confira o nome, o preço e as datas da promoção." };
    }
    if (
      startsAt &&
      endsAt &&
      new Date(startsAt).getTime() >= new Date(endsAt).getTime()
    ) {
      return { error: "A data final da promoção deve ser posterior à inicial." };
    }
    promotion = {
      label,
      price_cents: promotionPrice,
      starts_at: startsAt,
      ends_at: endsAt,
    };
  }

  return {
    service: {
      name,
      description,
      category,
      price_cents: price,
      duration_minutes: duration,
      direct_only: directOnly,
      direct_contact_url: contactUrl || null,
      active,
    },
    addons,
    promotion,
  };
}
