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
  business_name: "Ziah Cortes",
  whatsapp: "5531993253121",
  currency: "R$",
  services: [
    { name: "Corte", price: 30, addon_sobrancelha: 5, category: "corte_barba" },
    { name: "Barba", price: 20, addon_sobrancelha: 10, category: "corte_barba" },
    { name: "Corte + Barba", price: 50, addon_sobrancelha: 5, category: "corte_barba" },
    { name: "Sobrancelha sem cortar", price: 10, category: "acabamento" },
    { name: "Pezinho sem cortar", price: 10, category: "acabamento" },
    { name: "Escova", price: 15, category: "acabamento" },
    { name: "Luzes", price: 40, category: "quimica_cor" },
    { name: "Luzes alinhadas", price: 45, category: "quimica_cor" },
    { name: "Platinado/Cabelo colorido", price: 65, category: "quimica_cor" },
    { name: "Tintura/pigmentação (cor preta)", price: 20, category: "quimica_cor" },
    { name: "Tintura/pigmentação (castanho escuro/outros)", price: 25, category: "quimica_cor" },
    { name: "Progressiva", price: 60, category: "quimica_cor" },
    { name: "Botox", price: 45, category: "quimica_cor" },
    { name: "Relaxamento", price: 25, category: "quimica_cor" },
  ],
  direct_services: ["Botox", "Sobrancelha sem cortar"],
  slots: {
    morning: ["08:00", "09:00", "10:00", "11:00"],
    afternoon: ["14:00", "15:00", "16:00", "17:00", "18:00", "19:00"],
  },
  // Python weekday(): 0=Segunda, 1=Terça, 2=Quarta, 3=Quinta, 4=Sexta, 5=Sábado, 6=Domingo
  open_weekdays: [1, 2, 3, 4, 5],
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

