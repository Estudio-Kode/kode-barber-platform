"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BUSINESS_CONFIG,
  ServiceItem,
  WEEKDAY_FULL_LABELS,
} from "@/config/business";
import { SelectableDay } from "@/lib/domain";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { KodeFooter } from "@/components/KodeFooter";

type Screen = "identify" | "menu" | "service" | "slots" | "manage";

interface SlotItem {
  time: string;
  booked: boolean;
  blocked: boolean;
  past: boolean;
  too_soon: boolean;
}

interface ToastItem {
  id: number;
  message: string;
  type: "info" | "error" | "success";
}

function maskPhoneInput(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function weekStartKey(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - wd);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

export default function ClientBookingPage() {
  const [screen, setScreen] = useState<Screen>("identify");
  const [userName, setUserName] = useState("");
  const [userPhone, setUserPhone] = useState(""); // apenas dígitos
  const [nameInput, setNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");

  // Filtro de categorias de serviço
  const [categoryFilter, setCategoryFilter] = useState<
    "todos" | "corte_barba" | "quimica_cor" | "acabamento"
  >("todos");

  // Serviço selecionado
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(
    null
  );
  const [withSobrancelha, setWithSobrancelha] = useState(false);

  // Modal de adicional de sobrancelha
  const [addonPromptService, setAddonPromptService] =
    useState<ServiceItem | null>(null);

  // Dias e horários
  const [days, setDays] = useState<SelectableDay[]>([]);
  const [selectedDay, setSelectedDay] = useState<SelectableDay | null>(null);
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Semanas já agendadas localmente na sessão
  const [bookedWeeks, setBookedWeeks] = useState<string[]>([]);
  const [showWeekModal, setShowWeekModal] = useState(false);

  // Modal informativo (sucesso, atendimento combinado, cutoff)
  const [infoModal, setInfoModal] = useState<{
    icon: string;
    title: string;
    text: string;
    waText?: string;
    badge?: string;
  } | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback(
    (message: string, type: "info" | "error" | "success" = "info") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3800);
    },
    []
  );

  const waUrl = useCallback((text?: string) => {
    const msg = encodeURIComponent(
      text || "Olá! Vim pelo site de agendamento da Ziah Cortes."
    );
    return `https://wa.me/${BUSINESS_CONFIG.whatsapp}?text=${msg}`;
  }, []);

  // Carrega cliente salvo no localStorage e lista de dias
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("barber_user") || "null");
      if (saved && saved.phone && saved.name) {
        setUserName(saved.name);
        setUserPhone(saved.phone);
        setNameInput(saved.name);
        setPhoneInput(maskPhoneInput(saved.phone));
        setScreen("menu");
      }
    } catch {
      // ignore
    }

    fetch("/api/days")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.days)) setDays(d.days);
      })
      .catch(() => {});
  }, []);

  // Busca horários disponíveis e faz polling a cada 5s quando na tela de slots
  const fetchAvailability = useCallback(async (dateIso: string) => {
    try {
      const res = await fetch(
        `/api/availability?date=${encodeURIComponent(dateIso)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.slots)) {
        setSlots(data.slots);
      }
    } catch {
      // ignore
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    if (screen !== "slots" || !selectedDay) return;
    setLoadingSlots(true);
    fetchAvailability(selectedDay.date);
    const timer = setInterval(() => {
      fetchAvailability(selectedDay.date);
    }, 5000);
    return () => clearInterval(timer);
  }, [screen, selectedDay, fetchAvailability]);

  function handleIdentifySubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = nameInput.trim();
    const cleanPhone = phoneInput.replace(/\D/g, "");
    setNameError("");
    setPhoneError("");

    let ok = true;
    if (cleanName.length < 2) {
      setNameError("Informe seu nome completo ou apelido.");
      ok = false;
    }
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      setPhoneError("Informe um telefone válido com DDD.");
      ok = false;
    }
    if (!ok) return;

    setUserName(cleanName);
    setUserPhone(cleanPhone);
    try {
      localStorage.setItem(
        "barber_user",
        JSON.stringify({ name: cleanName, phone: cleanPhone })
      );
    } catch {
      // ignore
    }
    setScreen("menu");
  }

  function handleLogoutClient() {
    try {
      localStorage.removeItem("barber_user");
    } catch {
      // ignore
    }
    setUserName("");
    setUserPhone("");
    setNameInput("");
    setPhoneInput("");
    setScreen("identify");
  }

  function handlePickService(svc: ServiceItem) {
    const isDirect = BUSINESS_CONFIG.direct_services.includes(svc.name);
    if (isDirect) {
      setInfoModal({
        icon: "💬",
        title: "Atendimento combinado",
        text: `O serviço "${svc.name}" precisa de avaliação de tempo diretamente com o barbeiro. Toque abaixo para combinar pelo WhatsApp.`,
        waText: `Olá! Gostaria de agendar o serviço: ${svc.name}.`,
      });
      return;
    }

    if (svc.addon_sobrancelha != null) {
      setAddonPromptService(svc);
      return;
    }

    proceedToSlots(svc, false);
  }

  function proceedToSlots(svc: ServiceItem, sobrancelha: boolean) {
    setAddonPromptService(null);
    setSelectedService(svc);
    setWithSobrancelha(sobrancelha);
    setSelectedTime(null);
    if (!selectedDay && days.length > 0) {
      setSelectedDay(days[0]);
    }
    setScreen("slots");
  }

  const serviceDisplayName = useMemo(() => {
    if (!selectedService) return "";
    return withSobrancelha
      ? `${selectedService.name} + Sobrancelha`
      : selectedService.name;
  }, [selectedService, withSobrancelha]);

  const serviceTotalPrice = useMemo(() => {
    if (!selectedService) return 0;
    return (
      selectedService.price +
      (withSobrancelha && selectedService.addon_sobrancelha
        ? selectedService.addon_sobrancelha
        : 0)
    );
  }, [selectedService, withSobrancelha]);

  const selectedDayLabel = useMemo(() => {
    if (!selectedDay) return "";
    const fullWd =
      WEEKDAY_FULL_LABELS[selectedDay.weekday] || selectedDay.weekday;
    return `${fullWd}, ${selectedDay.day} ${selectedDay.month}`;
  }, [selectedDay]);

  function handleSlotClick(s: SlotItem) {
    const disabled = s.booked || s.blocked || s.past;
    if (s.too_soon && !disabled) {
      const mins = BUSINESS_CONFIG.booking_cutoff_minutes;
      const quando = selectedDayLabel
        ? `${selectedDayLabel} às ${s.time}`
        : `às ${s.time}`;
      setInfoModal({
        icon: "⏰",
        title: "Tempo limite atingido",
        text: `Faltam menos de ${mins} minutos para o horário das ${s.time}. Marcações em cima da hora devem ser combinadas direto com o barbeiro no WhatsApp.`,
        waText: `Olá! Gostaria de marcar o horário de ${quando}, mas o site informou que faltam menos de ${mins} minutos. Ainda está disponível?`,
      });
      return;
    }
    if (disabled) return;
    setSelectedTime(s.time);
  }

  async function handleConfirmBookClick() {
    if (!selectedDay || !selectedTime || !selectedService) {
      pushToast("Selecione o dia e o horário desejado.", "error");
      return;
    }
    const wk = weekStartKey(selectedDay.date);
    if (
      BUSINESS_CONFIG.week_booking_limit > 0 &&
      bookedWeeks.includes(wk)
    ) {
      setShowWeekModal(true);
      return;
    }
    await executeBooking(false);
  }

  async function executeBooking(confirmWeek: boolean) {
    if (!selectedDay || !selectedTime || !selectedService) return;
    setShowWeekModal(false);
    setSubmitting(true);

    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: userName,
          phone: userPhone,
          service: selectedService.name,
          sobrancelha: withSobrancelha,
          date: selectedDay.date,
          time: selectedTime,
          confirm_week: confirmWeek,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        const wk = weekStartKey(selectedDay.date);
        if (!bookedWeeks.includes(wk)) {
          setBookedWeeks((prev) => [...prev, wk]);
        }
        setInfoModal({
          icon: "✅",
          title: "Horário confirmado!",
          badge: `${BUSINESS_CONFIG.currency} ${serviceTotalPrice}`,
          text: `${serviceDisplayName} agendado para ${selectedDayLabel} às ${selectedTime}. Te esperamos na Ziah Cortes!`,
        });
        setSelectedTime(null);
        setScreen("menu");
        return;
      }

      if (res.status === 409 && data.code === "week_limit") {
        const wk = weekStartKey(selectedDay.date);
        if (!bookedWeeks.includes(wk)) {
          setBookedWeeks((prev) => [...prev, wk]);
        }
        setShowWeekModal(true);
        return;
      }

      if (res.status === 403 && data.code === "cutoff") {
        handleSlotClick({
          time: selectedTime,
          booked: false,
          blocked: false,
          past: false,
          too_soon: true,
        });
        fetchAvailability(selectedDay.date);
        return;
      }

      pushToast(data.error || "Não foi possível concluir o agendamento.", "error");
      fetchAvailability(selectedDay.date);
    } catch {
      pushToast("Falha de conexão. Tente novamente.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredServices = useMemo(() => {
    if (categoryFilter === "todos") return BUSINESS_CONFIG.services;
    return BUSINESS_CONFIG.services.filter(
      (s) => s.category === categoryFilter
    );
  }, [categoryFilter]);

  const morningSlots = useMemo(
    () => slots.filter((s) => s.time < "12:00"),
    [slots]
  );
  const afternoonSlots = useMemo(
    () => slots.filter((s) => s.time >= "12:00"),
    [slots]
  );

  const firstName = userName.split(" ")[0] || "Cliente";

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-page)] text-[var(--text-primary)]">
      {/* Topbar: no mobile centralizada; no desktop (lg+) vai de ponta a ponta (logo na extrema esquerda e ícones na extrema direita) */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[var(--bg-page)]/85 border-b border-[var(--border-color)]">
        <div className="w-full max-w-xl lg:max-w-none mx-auto px-4 lg:px-10 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (userPhone) setScreen("menu");
              else setScreen("identify");
            }}
            className="text-left focus:outline-none cursor-pointer"
          >
            <BrandLogo className="h-9 lg:h-10 w-auto" />
          </button>

          <div className="flex items-center gap-2 lg:gap-3">
            {userPhone && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs lg:text-sm px-2.5 lg:px-3.5 py-1 lg:py-1.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-secondary)]">
                <span className="w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full bg-amber-500" />
                {firstName}
              </span>
            )}
            <ThemeToggle />
            <Link
              href="/admin"
              className="text-xs lg:text-sm font-medium px-3 lg:px-4 py-1.5 rounded-full border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition"
            >
              Painel
            </Link>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal: mobile permanece max-w-xl; desktop expande conforme a tela */}
      <main
        className={`flex-1 w-full mx-auto px-4 pt-6 pb-20 lg:pb-6 lg:flex lg:flex-col lg:justify-center ${
          screen === "service"
            ? "max-w-xl lg:max-w-7xl lg:px-10 lg:pt-4"
            : screen === "slots"
            ? "max-w-xl lg:max-w-5xl lg:px-8"
            : "max-w-xl lg:max-w-4xl lg:px-8"
        }`}
      >
        {/* TELA 1: IDENTIFICAÇÃO */}
        {screen === "identify" && (
          <section className="rounded-2xl lg:rounded-3xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-6 sm:p-8 lg:p-12 shadow-[var(--shadow-card)]">
            <div className="flex flex-col items-center text-center mb-6 lg:mb-8">
              <div className="p-3 lg:p-4 rounded-2xl bg-[var(--accent-soft)] border border-[var(--border-strong)] mb-4">
                <BrandLogo className="h-12 lg:h-16 w-auto" />
              </div>
              <span className="text-[11px] lg:text-xs uppercase tracking-[0.2em] font-semibold text-[var(--accent)] mb-1">
                Agendamento Online
              </span>
              <h1 className="text-2xl lg:text-4xl font-bold tracking-tight">
                Bem-vindo à Ziah Cortes
              </h1>
              <p className="text-sm lg:text-base text-[var(--text-secondary)] mt-1.5 max-w-md">
                Informe seu nome e WhatsApp para escolher seu serviço e reservar
                seu horário em segundos.
              </p>
            </div>

            <form
              onSubmit={handleIdentifySubmit}
              noValidate
              className="space-y-4 lg:max-w-lg lg:mx-auto"
            >
              <div>
                <label
                  htmlFor="name"
                  className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5"
                >
                  Seu Nome
                </label>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Ex.: Davi Costa"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-4 py-3 lg:py-3.5 text-sm lg:text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition"
                />
                {nameError && (
                  <p className="text-xs text-[var(--danger)] mt-1.5">
                    {nameError}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="phone"
                  className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5"
                >
                  Seu Telefone / WhatsApp
                </label>
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="(31) 99999-9999"
                  value={phoneInput}
                  onChange={(e) =>
                    setPhoneInput(maskPhoneInput(e.target.value))
                  }
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-4 py-3 lg:py-3.5 text-sm lg:text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition"
                />
                {phoneError && (
                  <p className="text-xs text-[var(--danger)] mt-1.5">
                    {phoneError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full mt-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] font-semibold py-3.5 lg:py-4 px-5 text-sm lg:text-base shadow-lg shadow-amber-500/15 transition cursor-pointer"
              >
                Continuar para o agendamento &rarr;
              </button>
            </form>

            <div className="mt-6 lg:mt-8 pt-5 border-t border-[var(--border-color)] flex items-center justify-between text-xs lg:text-sm text-[var(--text-muted)] lg:max-w-lg lg:mx-auto">
              <span>📍 Atendimento de Terça a Sábado</span>
              <span>⏰ 08h às 19h</span>
            </div>
          </section>
        )}

        {/* TELA 2: MENU DO CLIENTE — No desktop fica bem maior, ocupando o retângulo roxo indicado */}
        {screen === "menu" && (
          <section className="space-y-5 w-full">
            <div className="rounded-2xl lg:rounded-3xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-6 lg:p-12 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="inline-flex items-center gap-1.5 text-xs lg:text-sm font-medium text-[var(--accent)] mb-1 lg:mb-2">
                    <span className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full bg-[var(--accent)]" />
                    Cliente identificado
                  </span>
                  <h1 className="text-2xl lg:text-4xl font-bold tracking-tight">
                    Olá, {firstName}!
                  </h1>
                  <p className="text-xs lg:text-base text-[var(--text-secondary)] mt-0.5 lg:mt-1.5">
                    📞 {maskPhoneInput(userPhone)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleLogoutClient}
                  className="text-xs lg:text-sm font-medium px-3 lg:px-4 py-1.5 lg:py-2 rounded-lg lg:rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
                >
                  Trocar conta
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 lg:gap-6 mt-6 lg:mt-10">
                <button
                  type="button"
                  onClick={() => setScreen("service")}
                  className="group text-left rounded-2xl lg:rounded-3xl border border-[var(--border-strong)] bg-gradient-to-br from-[var(--accent-soft)] to-transparent p-5 lg:p-8 lg:min-h-[220px] flex flex-col justify-between hover:border-[var(--accent)] transition cursor-pointer"
                >
                  <div className="w-10 h-10 lg:w-14 lg:h-14 rounded-xl lg:rounded-2xl bg-[var(--accent)] text-[var(--accent-fg)] flex items-center justify-center text-lg lg:text-2xl font-bold mb-3 lg:mb-6 shadow-md">
                    ✂️
                  </div>
                  <div>
                    <div className="font-bold text-base lg:text-2xl group-hover:text-[var(--accent)] transition">
                      Marcar horário
                    </div>
                    <div className="text-xs lg:text-sm text-[var(--text-secondary)] mt-1 lg:mt-2 leading-relaxed">
                      Escolha o serviço, dia e horário disponível em tempo real
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setScreen("manage")}
                  className="group text-left rounded-2xl lg:rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-5 lg:p-8 lg:min-h-[220px] flex flex-col justify-between hover:border-[var(--border-strong)] transition cursor-pointer"
                >
                  <div className="w-10 h-10 lg:w-14 lg:h-14 rounded-xl lg:rounded-2xl bg-[var(--bg-subtle)] flex items-center justify-center text-lg lg:text-2xl mb-3 lg:mb-6">
                    📅
                  </div>
                  <div>
                    <div className="font-bold text-base lg:text-2xl">
                      Minhas marcações
                    </div>
                    <div className="text-xs lg:text-sm text-[var(--text-secondary)] mt-1 lg:mt-2 leading-relaxed">
                      Consultar ou remarcar diretamente pelo WhatsApp
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* TELA 3: SERVIÇOS — No mobile é lista vertical; no desktop (lg+) é grade ampla multi-colunas sem precisar de scroll */}
        {screen === "service" && (
          <section className="space-y-4 lg:space-y-3 w-full">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setScreen("menu")}
                className="inline-flex items-center gap-1.5 text-xs lg:text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                &larr; Voltar ao início
              </button>
              <span className="text-xs lg:text-sm text-[var(--text-muted)]">
                Passo 1 de 2
              </span>
            </div>

            <div className="rounded-2xl lg:rounded-3xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-5 sm:p-6 lg:p-7 shadow-[var(--shadow-card)]">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 lg:gap-4 pb-2 lg:pb-4 lg:border-b lg:border-[var(--border-color)]">
                <div>
                  <h1 className="text-xl lg:text-2xl font-bold tracking-tight">
                    Escolha o serviço
                  </h1>
                  <p className="text-xs lg:text-sm text-[var(--text-secondary)] mt-0.5">
                    Selecione o procedimento desejado para ver os horários.
                  </p>
                </div>

                {/* Abas de filtro */}
                <div className="flex gap-1.5 overflow-x-auto py-2 lg:py-0 days-scroll-container">
                  {[
                    { id: "todos", label: "Todos" },
                    { id: "corte_barba", label: "Corte & Barba" },
                    { id: "quimica_cor", label: "Química & Cor" },
                    { id: "acabamento", label: "Acabamentos" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() =>
                        setCategoryFilter(
                          tab.id as typeof categoryFilter
                        )
                      }
                      className={`px-3 lg:px-4 py-1.5 lg:py-2 rounded-full text-xs lg:text-sm font-medium whitespace-nowrap transition cursor-pointer ${
                        categoryFilter === tab.id
                          ? "bg-[var(--accent)] text-[var(--accent-fg)] font-semibold"
                          : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lista no mobile / Grid de 3 colunas no desktop para caber os 14 serviços na tela sem scroll */}
              <div className="space-y-2.5 lg:space-y-0 lg:grid lg:grid-cols-3 xl:grid-cols-4 lg:gap-3 mt-2 lg:mt-4">
                {filteredServices.map((svc) => {
                  const isDirect = BUSINESS_CONFIG.direct_services.includes(
                    svc.name
                  );
                  return (
                    <button
                      key={svc.name}
                      type="button"
                      onClick={() => handlePickService(svc)}
                      className={`w-full text-left rounded-xl border p-4 lg:p-3.5 flex items-center justify-between gap-3 transition cursor-pointer ${
                        isDirect
                          ? "border-dashed border-[var(--border-color)] bg-[var(--bg-elevated)]/60 hover:border-[var(--border-strong)]"
                          : "border-[var(--border-color)] bg-[var(--bg-elevated)] hover:border-[var(--accent)]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                          <span className="leading-snug">{svc.name}</span>
                          {isDirect && (
                            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              Combinar no WhatsApp
                            </span>
                          )}
                        </div>
                        {svc.addon_sobrancelha != null && !isDirect && (
                          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                            ✨ Opção de incluir sobrancelha (+{" "}
                            {BUSINESS_CONFIG.currency} {svc.addon_sobrancelha})
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <span className="text-sm font-bold px-3 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--accent)]">
                          {BUSINESS_CONFIG.currency} {svc.price}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* TELA 4: DIA E HORÁRIO */}
        {screen === "slots" && selectedService && (
          <section className="space-y-4 w-full">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setScreen("service")}
                className="inline-flex items-center gap-1.5 text-xs lg:text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                &larr; Trocar serviço
              </button>
              <span className="text-xs lg:text-sm text-[var(--text-muted)]">
                Passo 2 de 2
              </span>
            </div>

            <div className="rounded-2xl lg:rounded-3xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-5 sm:p-6 lg:p-8 shadow-[var(--shadow-card)] space-y-6">
              {/* Resumo do serviço escolhido */}
              <div className="flex items-center justify-between gap-3 p-3.5 lg:p-4 rounded-xl bg-[var(--accent-soft)] border border-[var(--border-strong)]">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-[var(--accent)] font-semibold">
                    Serviço selecionado
                  </div>
                  <div className="font-bold text-sm lg:text-base mt-0.5">
                    {serviceDisplayName}
                  </div>
                </div>
                <div className="text-base lg:text-xl font-extrabold text-[var(--accent)]">
                  {BUSINESS_CONFIG.currency} {serviceTotalPrice}
                </div>
              </div>

              {/* Seleção de Dia */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    1. Escolha o dia
                  </h2>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Próximos {BUSINESS_CONFIG.max_days_ahead} dias
                  </span>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 days-scroll-container">
                  {days.map((d) => {
                    const isSelected = selectedDay?.date === d.date;
                    return (
                      <button
                        key={d.date}
                        type="button"
                        onClick={() => {
                          setSelectedDay(d);
                          setSelectedTime(null);
                        }}
                        className={`shrink-0 w-18 lg:w-20 rounded-xl border p-2.5 text-center transition cursor-pointer ${
                          isSelected
                            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)] shadow-md"
                            : "border-[var(--border-color)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)]"
                        }`}
                      >
                        <div
                          className={`text-[10px] uppercase font-semibold ${
                            isSelected
                              ? "text-[var(--accent-fg)]"
                              : "text-[var(--text-secondary)]"
                          }`}
                        >
                          {d.is_today ? "Hoje" : d.weekday.slice(0, 3)}
                        </div>
                        <div className="text-lg font-extrabold leading-tight my-0.5">
                          {d.day}
                        </div>
                        <div
                          className={`text-[10px] ${
                            isSelected
                              ? "text-[var(--accent-fg)]/80"
                              : "text-[var(--text-muted)]"
                          }`}
                        >
                          {d.month}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Grade de Horários */}
              {selectedDay && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      2. Escolha o horário ({selectedDayLabel})
                    </h2>
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      Ao vivo
                    </span>
                  </div>

                  {loadingSlots ? (
                    <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                      Carregando horários disponíveis...
                    </div>
                  ) : (
                    <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6">
                      {/* Manhã */}
                      <div>
                        <div className="text-xs font-medium text-[var(--text-muted)] mb-2">
                          ☀️ Manhã
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {morningSlots.map((s) => {
                            const disabled = s.booked || s.blocked || s.past;
                            const isPicked = selectedTime === s.time;
                            return (
                              <button
                                key={s.time}
                                type="button"
                                disabled={disabled}
                                onClick={() => handleSlotClick(s)}
                                title={
                                  s.too_soon && !disabled
                                    ? "Tempo limite atingido — combinar no WhatsApp"
                                    : disabled
                                    ? "Horário indisponível"
                                    : `Marcar às ${s.time}`
                                }
                                className={`py-2.5 lg:py-3 px-2 rounded-xl text-xs lg:text-sm font-bold border transition ${
                                  disabled
                                    ? "border-[var(--border-color)] bg-[var(--bg-page)]/40 text-[var(--text-muted)]/40 line-through cursor-not-allowed"
                                    : s.too_soon
                                    ? "border-amber-500/40 bg-amber-500/10 text-amber-400 cursor-pointer"
                                    : isPicked
                                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)] shadow-md cursor-pointer"
                                    : "border-[var(--border-color)] bg-[var(--bg-elevated)] hover:border-[var(--accent)] cursor-pointer"
                                }`}
                              >
                                {s.time}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Tarde */}
                      <div>
                        <div className="text-xs font-medium text-[var(--text-muted)] mb-2">
                          🌙 Tarde / Noite
                        </div>
                        <div className="grid grid-cols-4 lg:grid-cols-6 gap-2">
                          {afternoonSlots.map((s) => {
                            const disabled = s.booked || s.blocked || s.past;
                            const isPicked = selectedTime === s.time;
                            return (
                              <button
                                key={s.time}
                                type="button"
                                disabled={disabled}
                                onClick={() => handleSlotClick(s)}
                                title={
                                  s.too_soon && !disabled
                                    ? "Tempo limite atingido — combinar no WhatsApp"
                                    : disabled
                                    ? "Horário indisponível"
                                    : `Marcar às ${s.time}`
                                }
                                className={`py-2.5 lg:py-3 px-2 rounded-xl text-xs lg:text-sm font-bold border transition ${
                                  disabled
                                    ? "border-[var(--border-color)] bg-[var(--bg-page)]/40 text-[var(--text-muted)]/40 line-through cursor-not-allowed"
                                    : s.too_soon
                                    ? "border-amber-500/40 bg-amber-500/10 text-amber-400 cursor-pointer"
                                    : isPicked
                                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)] shadow-md cursor-pointer"
                                    : "border-[var(--border-color)] bg-[var(--bg-elevated)] hover:border-[var(--accent)] cursor-pointer"
                                }`}
                              >
                                {s.time}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Confirmação */}
              {selectedDay && selectedTime && (
                <div className="pt-4 border-t border-[var(--border-color)] space-y-3">
                  <div className="rounded-xl bg-[var(--bg-elevated)] p-4 text-xs lg:text-sm space-y-1.5 border border-[var(--border-color)]">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">
                        Cliente:
                      </span>
                      <span className="font-semibold">{userName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">
                        Serviço:
                      </span>
                      <span className="font-semibold">
                        {serviceDisplayName} ({BUSINESS_CONFIG.currency}{" "}
                        {serviceTotalPrice})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">
                        Data e hora:
                      </span>
                      <span className="font-bold text-[var(--accent)]">
                        {selectedDayLabel} às {selectedTime}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleConfirmBookClick}
                    className="w-full rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-fg)] font-bold py-3.5 px-5 text-sm lg:text-base shadow-lg shadow-amber-500/20 transition cursor-pointer"
                  >
                    {submitting
                      ? "Confirmando agendamento..."
                      : `Confirmar marcação às ${selectedTime}`}
                  </button>
                </div>
              )}

              {/* Ajuda WhatsApp */}
              <div className="pt-4 border-t border-[var(--border-color)] flex items-center justify-between gap-3">
                <span className="text-xs lg:text-sm text-[var(--text-secondary)]">
                  Ficou com alguma dúvida?
                </span>
                <a
                  href={waUrl("Olá! Tenho uma dúvida sobre o agendamento.")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs lg:text-sm font-semibold px-3.5 py-2 rounded-xl bg-[var(--whatsapp)] hover:bg-[var(--whatsapp-hover)] text-white transition"
                >
                  💬 Falar no WhatsApp
                </a>
              </div>
            </div>
          </section>
        )}

        {/* TELA 5: GERENCIAR MARCAÇÕES */}
        {screen === "manage" && (
          <section className="space-y-4 w-full">
            <button
              type="button"
              onClick={() => setScreen("menu")}
              className="inline-flex items-center gap-1.5 text-xs lg:text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              &larr; Voltar ao menu
            </button>

            <div className="rounded-2xl lg:rounded-3xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-6 lg:p-10 shadow-[var(--shadow-card)] space-y-4">
              <div className="w-11 h-11 lg:w-14 lg:h-14 rounded-2xl bg-[var(--accent-soft)] border border-[var(--border-strong)] flex items-center justify-center text-xl lg:text-2xl">
                🔒
              </div>
              <h1 className="text-xl lg:text-3xl font-bold tracking-tight">
                Consulte ou altere suas marcações
              </h1>
              <p className="text-sm lg:text-base text-[var(--text-secondary)] leading-relaxed">
                Para proteger sua privacidade e impedir que terceiros visualizem
                ou desmarquem seus horários usando apenas o número de telefone,
                a consulta e o cancelamento são feitos diretamente com o
                barbeiro pelo WhatsApp.
              </p>

              <a
                href={waUrl(
                  `Olá! Sou ${userName} (${maskPhoneInput(
                    userPhone
                  )}) e preciso consultar/alterar minha marcação.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--whatsapp)] hover:bg-[var(--whatsapp-hover)] text-white font-semibold py-3.5 lg:py-4 px-5 text-sm lg:text-base transition"
              >
                💬 Falar com o barbeiro no WhatsApp
              </a>
            </div>
          </section>
        )}
      </main>

      <KodeFooter />

      {/* MODAL: ADICIONAL DE SOBRANCELHA */}
      {addonPromptService && (
        <div
          onClick={() => proceedToSlots(addonPromptService, false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-6 text-center shadow-2xl space-y-4"
          >
            <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--accent-soft)] border border-[var(--border-strong)] flex items-center justify-center text-2xl">
              ✨
            </div>
            <h2 className="text-lg font-bold">Incluir sobrancelha?</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Deseja adicionar <strong>Sobrancelha</strong> ao serviço de{" "}
              <strong>{addonPromptService.name}</strong> por apenas{" "}
              <span className="text-[var(--accent)] font-bold">
                + {BUSINESS_CONFIG.currency}{" "}
                {addonPromptService.addon_sobrancelha}
              </span>
              ?
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => proceedToSlots(addonPromptService, true)}
                className="w-full rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] font-bold py-3 text-sm transition cursor-pointer"
              >
                Sim, incluir (+ {BUSINESS_CONFIG.currency}{" "}
                {addonPromptService.addon_sobrancelha})
              </button>
              <button
                type="button"
                onClick={() => proceedToSlots(addonPromptService, false)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)] py-3 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
              >
                Não, somente {addonPromptService.name}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAÇÃO DE LIMITE SEMANAL */}
      {showWeekModal && (
        <div
          onClick={() => setShowWeekModal(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-6 text-center shadow-2xl space-y-4"
          >
            <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--accent-soft)] border border-[var(--border-strong)] flex items-center justify-center text-2xl">
              📅
            </div>
            <h2 className="text-lg font-bold">
              Você já tem um horário nesta semana
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Identificamos que já existe um agendamento para o seu número nesta
              mesma semana. Deseja confirmar mais um horário mesmo assim?
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => executeBooking(true)}
                className="w-full rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] font-bold py-3 text-sm transition cursor-pointer"
              >
                Sim, marcar mesmo assim
              </button>
              <button
                type="button"
                onClick={() => setShowWeekModal(false)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] py-3 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
              >
                Não, voltar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GENÉRICO DE INFORMAÇÃO / CONFIRMAÇÃO */}
      {infoModal && (
        <div
          onClick={() => setInfoModal(null)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-6 text-center shadow-2xl space-y-4"
          >
            <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--accent-soft)] border border-[var(--border-strong)] flex items-center justify-center text-2xl">
              {infoModal.icon}
            </div>
            {infoModal.badge && (
              <span className="inline-block text-xs font-bold px-3 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                Total: {infoModal.badge}
              </span>
            )}
            <h2 className="text-lg font-bold">{infoModal.title}</h2>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {infoModal.text}
            </p>
            <div className="flex flex-col gap-2 pt-2">
              {infoModal.waText && (
                <a
                  href={waUrl(infoModal.waText)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--whatsapp)] hover:bg-[var(--whatsapp-hover)] text-white font-semibold py-3 text-sm transition"
                >
                  💬 Falar com o barbeiro no WhatsApp
                </a>
              )}
              <button
                type="button"
                onClick={() => setInfoModal(null)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] py-3 text-sm font-semibold text-[var(--text-primary)] transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOASTS */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl border px-4 py-3 text-xs font-semibold shadow-lg backdrop-blur-md ${
              t.type === "error"
                ? "border-red-500/40 bg-red-950/90 text-red-200"
                : t.type === "success"
                ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-200"
                : "border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
