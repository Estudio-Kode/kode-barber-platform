import { BUSINESS_CONFIG } from "@/config/business";
import {
  getNowBr,
  parseIsoDateLocal,
  pyWeekday,
  toIsoDate,
} from "@/lib/domain";
import type {
  PublicBusinessProfile,
  PublicBusinessService,
} from "@/lib/supabase-server";

export function getCurrentPromotion(
  service: PublicBusinessService,
  now = new Date()
): PublicBusinessService["promotions"][number] | null {
  return (
    service.promotions
      .filter((promotion) => {
        const startsAt = promotion.starts_at
          ? new Date(promotion.starts_at).getTime()
          : Number.NEGATIVE_INFINITY;
        const endsAt = promotion.ends_at
          ? new Date(promotion.ends_at).getTime()
          : Number.POSITIVE_INFINITY;
        return startsAt <= now.getTime() && endsAt >= now.getTime();
      })
      .sort((a, b) => a.price_cents - b.price_cents)[0] ?? null
  );
}

export function getCurrentServicePrice(
  service: PublicBusinessService,
  now = new Date()
): number {
  return getCurrentPromotion(service, now)?.price_cents ?? service.price_cents;
}

export function getEligibleBarbers(
  profile: PublicBusinessProfile,
  serviceId: string
): PublicBusinessProfile["barbers"] {
  const assignments = profile.barber_services.filter(
    (assignment) => assignment.service_id === serviceId
  );
  if (assignments.length === 0) return profile.barbers;
  const assignedIds = new Set(assignments.map((assignment) => assignment.barber_id));
  const assignedBarbers = profile.barbers.filter((barber) =>
    assignedIds.has(barber.id)
  );
  return assignedBarbers;
}

export function resolveBookingBarber(
  profile: PublicBusinessProfile,
  serviceId: string,
  requestedBarberId: string | null
): string | null | undefined {
  const eligible = getEligibleBarbers(profile, serviceId);
  if (eligible.length === 0) {
    return profile.barbers.length === 0 && !requestedBarberId ? null : undefined;
  }
  if (!requestedBarberId && eligible.length === 1) return eligible[0].id;
  if (!requestedBarberId || !eligible.some((barber) => barber.id === requestedBarberId)) {
    return undefined;
  }
  return requestedBarberId;
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function fromMinutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(
    value % 60
  ).padStart(2, "0")}`;
}

function overlaps(
  firstStart: number,
  firstDuration: number,
  secondStart: number,
  secondDuration: number
): boolean {
  return (
    firstStart < secondStart + secondDuration &&
    secondStart < firstStart + firstDuration
  );
}

export function getPublicAvailableTimes(
  profile: PublicBusinessProfile,
  service: PublicBusinessService,
  barberId: string | null,
  date: string,
  state: {
    appointments: Array<{
      time: string;
      barber_id: string | null;
      service_id: string | null;
    }>;
    blocked_slots: Array<{ time: string; barber_id: string | null }>;
  }
): string[] {
  const parsedDate = parseIsoDateLocal(date);
  if (!parsedDate || profile.status !== "active") return [];
  const now = getNowBr();
  const today = toIsoDate(now);
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + BUSINESS_CONFIG.max_days_ahead);
  if (date < today || date > toIsoDate(maxDate)) return [];

  const weekday = pyWeekday(parsedDate);
  const selectedBarber = profile.barbers.find((barber) => barber.id === barberId);
  const barberHours =
    barberId === null
      ? []
      : profile.hours.filter(
          (hours) =>
            hours.barber_id === barberId && hours.weekday === weekday
        );
  // Barbeiro-specific hours replace the business-wide hours for that weekday.
  const hoursForDay =
    selectedBarber?.custom_hours
      ? barberHours
      : profile.hours.filter(
          (hours) => hours.barber_id === null && hours.weekday === weekday
        );
  if (hoursForDay.length === 0) return [];

  const duration = service.duration_minutes;
  const serviceDurations = new Map(
    profile.services.map((item) => [item.id, item.duration_minutes])
  );
  const slots = new Set<string>();

  for (const hours of hoursForDay) {
    const opensAt = toMinutes(hours.open_time);
    const closesAt = toMinutes(hours.close_time);
    const availableStarts =
      hours.available_times.length > 0
        ? hours.available_times.map(toMinutes)
        : (() => {
            const starts: number[] = [];
            for (
              let start = opensAt;
              start + duration <= closesAt;
              start += hours.slot_interval_minutes
            ) {
              starts.push(start);
            }
            return starts;
          })();

    for (const start of availableStarts) {
      if (start + duration > closesAt) continue;
      const time = fromMinutes(start);
      const slotDateTime = new Date(
        parsedDate.getFullYear(),
        parsedDate.getMonth(),
        parsedDate.getDate(),
        Math.floor(start / 60),
        start % 60
      );
      if (
        slotDateTime.getTime() - now.getTime() <=
        BUSINESS_CONFIG.booking_cutoff_minutes * 60_000
      ) {
        continue;
      }

      // Check the full service interval so a longer appointment cannot overlap another.
      const blocked = state.blocked_slots.some((slot) => {
        if (slot.barber_id !== null && slot.barber_id !== barberId) return false;
        return overlaps(start, duration, toMinutes(slot.time), 30);
      });
      if (blocked) continue;

      const booked = state.appointments.some((appointment) => {
        if (
          appointment.barber_id !== null &&
          appointment.barber_id !== barberId
        ) {
          return false;
        }
        return overlaps(
          start,
          duration,
          toMinutes(appointment.time),
          appointment.service_id
            ? serviceDurations.get(appointment.service_id) ?? 30
            : 30
        );
      });
      if (!booked) slots.add(time);
    }
  }

  return [...slots].sort();
}
