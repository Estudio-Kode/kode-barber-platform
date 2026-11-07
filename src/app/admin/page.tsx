"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BUSINESS_CONFIG, getAppointmentPrice } from "@/config/business";
import { SelectableDay } from "@/lib/domain";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { KodeFooter } from "@/components/KodeFooter";

interface AdminSlotItem {
  time: string;
  blocked: boolean;
  past: boolean;
  appointment: {
    id: number;
    name: string;
    phone: string;
    service: string;
    price?: number;
  } | null;
}

interface ToastItem {
  id: number;
  message: string;
  type: "info" | "error" | "success";
}

function formatPhone(digits: string): string {
  const d = (digits || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

function clientWaUrl(phone: string, clientName: string, timeStr: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  const msg = encodeURIComponent(
    `Olá, ${clientName}! Tudo bem? Aqui é da Ziah Cortes sobre seu horário das ${timeStr}.`
  );
  return `https://wa.me/${full}?text=${msg}`;
}

export default function AdminDashboardPage() {
  const [authState, setAuthState] = useState<"checking" | "login" | "panel">(
    "checking"
  );
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [days, setDays] = useState<SelectableDay[]>([]);
  const [selectedDay, setSelectedDay] = useState<SelectableDay | null>(null);
  const [slots, setSlots] = useState<AdminSlotItem[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Observações do dia
  const [dayNote, setDayNote] = useState("");
  const [notesStatus, setNotesStatus] = useState("");
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentNotesDateRef = useRef<string | null>(null);

  // Telefone copiado recentemente
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  // Modal de confirmação
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    text: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback(
    (message: string, type: "info" | "error" | "success" = "info") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3500);
    },
    []
  );

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, [token]);

  const handleLogout = useCallback(
    async (expired = false) => {
      try {
        sessionStorage.removeItem("barber_admin_token");
      } catch {
        // ignore
      }
      await fetch("/api/admin/session", { method: "POST" }).catch(() => {});
      setToken(null);
      setPassword("");
      setAuthState("login");
      if (expired) {
        pushToast("Sessão expirada, entre novamente.", "error");
      }
    },
    [pushToast]
  );

  // Verifica sessão ao abrir
  useEffect(() => {
    let savedTok: string | null = null;
    try {
      savedTok = sessionStorage.getItem("barber_admin_token");
      if (savedTok) setToken(savedTok);
    } catch {
      // ignore
    }

    const headers: Record<string, string> = {};
    if (savedTok) headers["Authorization"] = `Bearer ${savedTok}`;

    fetch("/api/admin/session", { headers })
      .then((res) => {
        if (res.ok) {
          setAuthState("panel");
        } else {
          setAuthState("login");
        }
      })
      .catch(() => setAuthState("login"));
  }, []);

  // Carrega dias quando autenticado
  useEffect(() => {
    if (authState !== "panel") return;
    fetch("/api/days")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.days) && d.days.length > 0) {
          setDays(d.days);
          const todayItem =
            d.days.find((x: SelectableDay) => x.is_today) || d.days[0];
          setSelectedDay(todayItem);
        }
      })
      .catch(() => {});
  }, [authState]);

  const loadSlotsForDate = useCallback(
    async (dateStr: string) => {
      try {
        const res = await fetch(
          `/api/admin/slots?date=${encodeURIComponent(dateStr)}`,
          {
            headers: authHeaders(),
            cache: "no-store",
          }
        );
        if (res.status === 401) {
          handleLogout(true);
          return;
        }
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
    },
    [authHeaders, handleLogout]
  );

  const loadNotesForDate = useCallback(
    async (dateStr: string) => {
      currentNotesDateRef.current = dateStr;
      setDayNote("");
      setNotesStatus("");
      try {
        const res = await fetch(
          `/api/admin/notes?date=${encodeURIComponent(dateStr)}`,
          {
            headers: authHeaders(),
            cache: "no-store",
          }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (currentNotesDateRef.current === dateStr) {
          setDayNote(data.note || "");
        }
      } catch {
        // ignore
      }
    },
    [authHeaders]
  );

  const saveNotesNow = useCallback(
    async (dateStr: string, noteText: string) => {
      if (!dateStr) return;
      if (notesTimerRef.current) {
        clearTimeout(notesTimerRef.current);
        notesTimerRef.current = null;
      }
      setNotesStatus("Salvando…");
      try {
        const res = await fetch("/api/admin/notes", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ date: dateStr, note: noteText }),
        });
        if (res.status === 401) {
          handleLogout(true);
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (currentNotesDateRef.current === dateStr) {
          setNotesStatus(res.ok ? "Salvo ✓" : data.error || "Erro ao salvar");
        }
      } catch {
        if (currentNotesDateRef.current === dateStr) {
          setNotesStatus("Erro ao salvar");
        }
      }
    },
    [authHeaders, handleLogout]
  );

  // Polling dos slots a cada 8s quando um dia está selecionado
  useEffect(() => {
    if (authState !== "panel" || !selectedDay) return;
    setLoadingSlots(true);
    loadSlotsForDate(selectedDay.date);
    loadNotesForDate(selectedDay.date);

    const timer = setInterval(() => {
      loadSlotsForDate(selectedDay.date);
    }, 8000);
    return () => clearInterval(timer);
  }, [authState, selectedDay, loadSlotsForDate, loadNotesForDate]);

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) {
        setToken(data.token);
        try {
          sessionStorage.setItem("barber_admin_token", data.token);
        } catch {
          // ignore
        }
        setAuthState("panel");
      } else {
        setLoginError(data.error || "Falha no login.");
      }
    } catch {
      setLoginError("Erro de conexão ao tentar entrar.");
    } finally {
      setLoggingIn(false);
    }
  }

  function handleNoteChange(val: string) {
    setDayNote(val);
    setNotesStatus("Editando…");
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    const targetDate = selectedDay?.date || "";
    notesTimerRef.current = setTimeout(() => {
      saveNotesNow(targetDate, val);
    }, 1000);
  }

  async function handleCopyPhone(phone: string) {
    const digits = (phone || "").replace(/\D/g, "");
    if (!digits) return;
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(digits);
        copied = true;
      }
    } catch {
      // fallback
    }
    if (!copied) {
      try {
        const ta = document.createElement("textarea");
        ta.value = digits;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        copied = false;
      }
    }
    if (copied) {
      setCopiedPhone(digits);
      pushToast("Telefone copiado para a área de transferência.", "success");
      setTimeout(() => setCopiedPhone(null), 1500);
    } else {
      pushToast("Não foi possível copiar.", "error");
    }
  }

  async function cancelAppointment(id: number) {
    if (!selectedDay) return;
    const res = await fetch(`/api/admin/appointments/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.status === 401) {
      handleLogout(true);
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      pushToast("Horário desmarcado e liberado novamente.", "success");
      loadSlotsForDate(selectedDay.date);
    } else {
      pushToast(data.error || "Erro ao desmarcar.", "error");
    }
  }

  async function blockSlot(timeStr: string) {
    if (!selectedDay) return;
    const res = await fetch("/api/admin/blocks", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ date: selectedDay.date, time: timeStr }),
    });
    if (res.status === 401) {
      handleLogout(true);
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      pushToast(`Horário das ${timeStr} bloqueado.`, "success");
      loadSlotsForDate(selectedDay.date);
    } else {
      pushToast(data.error || "Erro ao bloquear horário.", "error");
    }
  }

  async function unblockSlot(timeStr: string) {
    if (!selectedDay) return;
    const res = await fetch("/api/admin/blocks", {
      method: "DELETE",
      headers: authHeaders(),
      body: JSON.stringify({ date: selectedDay.date, time: timeStr }),
    });
    if (res.status === 401) {
      handleLogout(true);
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      pushToast(`Horário das ${timeStr} liberado novamente.`, "success");
      loadSlotsForDate(selectedDay.date);
    } else {
      pushToast(data.error || "Erro ao desbloquear.", "error");
    }
  }

  // Métricas rápidas do dia selecionado
  const metrics = useMemo(() => {
    let bookedCount = 0;
    let freeCount = 0;
    let blockedCount = 0;
    let estimatedRevenue = 0;

    for (const s of slots) {
      if (s.appointment) {
        bookedCount++;
        const price =
          s.appointment.price ?? getAppointmentPrice(s.appointment.service);
        estimatedRevenue += price;
      } else if (s.blocked) {
        blockedCount++;
      } else if (!s.past) {
        freeCount++;
      }
    }

    return { bookedCount, freeCount, blockedCount, estimatedRevenue };
  }, [slots]);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-page)] text-[var(--text-primary)]">
      {/* Topbar: mobile centralizada; desktop de ponta a ponta */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[var(--bg-page)]/85 border-b border-[var(--border-color)]">
        <div className="w-full max-w-2xl lg:max-w-none mx-auto px-4 lg:px-10 h-16 flex items-center justify-between">
          <Link href="/" className="focus:outline-none">
            <BrandLogo className="h-9 lg:h-10 w-auto" />
          </Link>

          <div className="flex items-center gap-2 lg:gap-3">
            <ThemeToggle />
            <Link
              href="/"
              className="text-xs lg:text-sm font-medium px-3 lg:px-4 py-1.5 rounded-full border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
            >
              Ver Site
            </Link>
            {authState === "panel" && (
              <button
                type="button"
                onClick={() => handleLogout(false)}
                className="text-xs lg:text-sm font-semibold px-3 lg:px-4 py-1.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition cursor-pointer"
              >
                Sair
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl lg:max-w-5xl mx-auto px-4 lg:px-8 pt-6 pb-20">
        {authState === "checking" && (
          <div className="py-16 text-center text-sm text-[var(--text-muted)]">
            Verificando sessão administrativa...
          </div>
        )}

        {/* TELA DE LOGIN */}
        {authState === "login" && (
          <section className="max-w-md mx-auto rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-6 sm:p-8 shadow-[var(--shadow-card)]">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="p-3 rounded-2xl bg-[var(--accent-soft)] border border-[var(--border-strong)] mb-4">
                <BrandLogo className="h-11 w-auto" />
              </div>
              <span className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[var(--accent)] mb-1">
                Área Restrita
              </span>
              <h1 className="text-xl font-bold">Painel do Barbeiro</h1>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Entre com seu usuário e senha para gerenciar a agenda.
              </p>
            </div>

            <form onSubmit={handleLoginSubmit} noValidate className="space-y-4">
              <div>
                <label
                  htmlFor="admin-user"
                  className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5"
                >
                  Usuário
                </label>
                <input
                  id="admin-user"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-4 py-3 text-sm focus:outline-none focus:border-[var(--accent)] transition"
                />
              </div>

              <div>
                <label
                  htmlFor="admin-pass"
                  className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5"
                >
                  Senha
                </label>
                <input
                  id="admin-pass"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-4 py-3 text-sm focus:outline-none focus:border-[var(--accent)] transition"
                />
              </div>

              {loginError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                disabled={loggingIn}
                className="w-full rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-fg)] font-bold py-3.5 text-sm shadow-lg shadow-amber-500/15 transition cursor-pointer"
              >
                {loggingIn ? "Entrando..." : "Entrar no Painel"}
              </button>
            </form>
          </section>
        )}

        {/* TELA DO PAINEL */}
        {authState === "panel" && (
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Agenda da Barbearia
                </h1>
                <p className="text-xs text-[var(--text-secondary)]">
                  Selecione um dia para ver marcações, bloquear horários ou
                  anotar observações.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 self-start sm:self-auto">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Sincronização automática
              </span>
            </div>

            {/* Carrossel de Dias */}
            <div className="flex gap-2 overflow-x-auto pb-2 days-scroll-container">
              {days.map((d) => {
                const isSelected = selectedDay?.date === d.date;
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => {
                      if (
                        notesTimerRef.current &&
                        currentNotesDateRef.current
                      ) {
                        saveNotesNow(currentNotesDateRef.current, dayNote);
                      }
                      setSelectedDay(d);
                    }}
                    className={`shrink-0 w-18 rounded-xl border p-2.5 text-center transition cursor-pointer ${
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)] shadow-md"
                        : "border-[var(--border-color)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]"
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

            {/* Resumo Rápido do Dia */}
            {selectedDay && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-4">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    Marcados
                  </div>
                  <div className="text-2xl font-extrabold text-[var(--accent)] mt-1">
                    {metrics.bookedCount}
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-4">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    Livres
                  </div>
                  <div className="text-2xl font-extrabold text-emerald-400 mt-1">
                    {metrics.freeCount}
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-4">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    Previsão
                  </div>
                  <div className="text-xl sm:text-2xl font-extrabold mt-1">
                    {BUSINESS_CONFIG.currency} {metrics.estimatedRevenue}
                  </div>
                </div>
              </div>
            )}

            {/* Lista de Horários do Dia */}
            {selectedDay && (
              <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-5 sm:p-6 shadow-[var(--shadow-card)] space-y-5">
                <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                  <h2 className="text-base font-bold">
                    Horários — {selectedDay.weekday}, {selectedDay.day}{" "}
                    {selectedDay.month}
                    {selectedDay.is_today ? " (hoje)" : ""}
                  </h2>
                  <span className="text-xs text-[var(--text-muted)]">
                    {slots.length} horários
                  </span>
                </div>

                {loadingSlots ? (
                  <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                    Carregando agenda do dia...
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {slots.map((s) => {
                      if (s.appointment) {
                        const appt = s.appointment;
                        const isCopied =
                          copiedPhone === appt.phone.replace(/\D/g, "");
                        return (
                          <div
                            key={s.time}
                            className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)]">
                                  {s.time}
                                </span>
                                <span className="font-bold text-sm">
                                  {appt.service}
                                </span>
                                {appt.price != null && appt.price > 0 && (
                                  <span className="text-xs font-semibold text-[var(--accent)]">
                                    ({BUSINESS_CONFIG.currency} {appt.price})
                                  </span>
                                )}
                              </div>

                              <div className="text-xs text-[var(--text-secondary)] flex items-center gap-2 flex-wrap pt-0.5">
                                <span className="font-medium text-[var(--text-primary)]">
                                  👤 {appt.name}
                                </span>
                                <span>&middot;</span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyPhone(appt.phone)}
                                  title="Clique para copiar o telefone"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-[var(--accent)] text-xs font-mono cursor-pointer transition"
                                >
                                  {isCopied
                                    ? "Copiado ✓"
                                    : `📋 ${formatPhone(appt.phone)}`}
                                </button>
                                <a
                                  href={clientWaUrl(
                                    appt.phone,
                                    appt.name,
                                    s.time
                                  )}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 text-xs font-medium transition"
                                >
                                  💬 WhatsApp
                                </a>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                setConfirmDialog({
                                  title: "Desmarcar horário",
                                  text: `Tem certeza que deseja desmarcar ${appt.name} (${appt.service} às ${s.time})? O horário voltará a ficar livre no site.`,
                                  confirmLabel: "Sim, desmarcar",
                                  danger: true,
                                  onConfirm: () => cancelAppointment(appt.id),
                                })
                              }
                              className="self-end sm:self-center shrink-0 text-xs font-semibold px-3.5 py-2 rounded-xl border border-red-500/40 bg-red-500/15 hover:bg-red-500/25 text-red-300 transition cursor-pointer"
                            >
                              Desmarcar
                            </button>
                          </div>
                        );
                      }

                      if (s.blocked) {
                        return (
                          <div
                            key={s.time}
                            className="rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--bg-page)]/50 p-3.5 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                                {s.time}
                              </span>
                              <div>
                                <div className="text-xs font-semibold text-[var(--text-secondary)]">
                                  🔒 Horário bloqueado
                                </div>
                                <div className="text-[11px] text-[var(--text-muted)]">
                                  Indisponível para clientes no site
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => unblockSlot(s.time)}
                              className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] hover:border-[var(--accent)] text-[var(--text-primary)] transition cursor-pointer"
                            >
                              Desbloquear
                            </button>
                          </div>
                        );
                      }

                      if (s.past) {
                        return (
                          <div
                            key={s.time}
                            className="rounded-xl border border-[var(--border-color)]/50 bg-[var(--bg-page)]/30 p-3 flex items-center justify-between opacity-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)]">
                                {s.time}
                              </span>
                              <span className="text-xs text-[var(--text-muted)]">
                                Horário já passou
                              </span>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={s.time}
                          className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)]/60 p-3.5 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              {s.time}
                            </span>
                            <span className="text-xs font-medium text-[var(--text-secondary)]">
                              Livre para agendamento
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setConfirmDialog({
                                title: "Bloquear horário",
                                text: `Bloquear o horário das ${s.time}? Nenhum cliente poderá marcar neste horário até você desbloquear.`,
                                confirmLabel: "Bloquear horário",
                                onConfirm: () => blockSlot(s.time),
                              })
                            }
                            className="text-xs font-medium px-3 py-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
                          >
                            Bloquear
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Observações do Dia */}
                <div className="pt-5 border-t border-[var(--border-color)] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="dayNotes"
                      className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                    >
                      📝 Observações do dia (visível apenas para você)
                    </label>
                    <span className="text-xs text-[var(--text-muted)]">
                      {notesStatus}
                    </span>
                  </div>

                  <textarea
                    id="dayNotes"
                    rows={4}
                    maxLength={2000}
                    value={dayNote}
                    onChange={(e) => handleNoteChange(e.target.value)}
                    onBlur={() => {
                      if (notesTimerRef.current && selectedDay) {
                        saveNotesNow(selectedDay.date, dayNote);
                      }
                    }}
                    placeholder="Anotações para este dia (ex.: encaixes, lembretes, produtos)..."
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-3.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition"
                  />

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        selectedDay && saveNotesNow(selectedDay.date, dayNote)
                      }
                      className="text-xs font-semibold px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] transition cursor-pointer"
                    >
                      Salvar observações
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      <KodeFooter />

      {/* MODAL DE CONFIRMAÇÃO */}
      {confirmDialog && (
        <div
          onClick={() => setConfirmDialog(null)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-6 text-center shadow-2xl space-y-4"
          >
            <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--accent-soft)] border border-[var(--border-strong)] flex items-center justify-center text-2xl">
              ⚠️
            </div>
            <h2 className="text-lg font-bold">{confirmDialog.title}</h2>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {confirmDialog.text}
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const fn = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  fn();
                }}
                className={`w-full rounded-xl font-bold py-3 text-sm transition cursor-pointer ${
                  confirmDialog.danger
                    ? "bg-red-600 hover:bg-red-500 text-white"
                    : "bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)]"
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] py-3 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
              >
                Cancelar
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

