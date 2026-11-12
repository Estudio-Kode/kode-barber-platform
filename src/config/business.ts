export interface ServiceItem {
  name: string;
  price: number;
  addon_sobrancelha?: number;
  category?: "corte_barba" | "quimica_cor" | "acabamento";
  durationLabel?: string;
}

export interface BusinessConfig {
  business_name: string;
  whatsapp: string;
  currency: string;
  services: ServiceItem[];
  direct_services: string[];
  slots: {
    morning: string[];
    afternoon: string[];
  };
  /** 1 = Segunda, 2 = Terça, 3 = Quarta, 4 = Quinta, 5 = Sexta, 6 = Sábado, 0 = Domingo (padrão JS getDay ou ISO? Aqui mantemos igual ao Python weekday(): 0=Segunda ... 6=Domingo) */
  open_weekdays: number[];
  max_days_ahead: number;
  cancel_min_hours: number;
  booking_cutoff_minutes: number;
  week_booking_limit: number;
}

export const BUSINESS_CONFIG: BusinessConfig = {
  business_name: "",
  whatsapp: "",
  currency: "R$",
  services: [],
  direct_services: [],
  slots: {
    morning: [],
    afternoon: [],
  },
  // Python weekday(): 0=Segunda, 1=Terça, 2=Quarta, 3=Quinta, 4=Sexta, 5=Sábado, 6=Domingo
  open_weekdays: [],
  max_days_ahead: 30,
  cancel_min_hours: 2,
  booking_cutoff_minutes: 30,
  week_booking_limit: 1,
};

export const WEEKDAY_LABELS = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
] as const;

export const WEEKDAY_FULL_LABELS: Record<string, string> = {
  Segunda: "Segunda-feira",
  Terça: "Terça-feira",
  Quarta: "Quarta-feira",
  Quinta: "Quinta-feira",
  Sexta: "Sexta-feira",
  Sábado: "Sábado",
  Domingo: "Domingo",
};

export const MONTH_LABELS = [
  "",
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

export function getAllSlots(): string[] {
  return [...BUSINESS_CONFIG.slots.morning, ...BUSINESS_CONFIG.slots.afternoon];
}

export function getServiceByName(name: string): ServiceItem | undefined {
  return BUSINESS_CONFIG.services.find((s) => s.name === name);
}

/**
 * Calcula o preço estimado de um agendamento (considerando "+ Sobrancelha").
 */
export function getAppointmentPrice(serviceLabel: string): number {
  const hasAddon = serviceLabel.endsWith(" + Sobrancelha");
  const baseName = hasAddon
    ? serviceLabel.replace(/ \+ Sobrancelha$/, "")
    : serviceLabel;
  const svc = getServiceByName(baseName);
  if (!svc) return 0;
  return svc.price + (hasAddon && svc.addon_sobrancelha ? svc.addon_sobrancelha : 0);
}

