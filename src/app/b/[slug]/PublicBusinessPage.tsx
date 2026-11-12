"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  getCurrentPromotion,
  getCurrentServicePrice,
  getEligibleBarbers,
} from "@/lib/public-booking";
import type { PublicBusinessProfile } from "@/lib/supabase-server";

const fieldClass =
  "mt-1.5 w-full rounded-xl border border-white/10 bg-[#15171c] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400/70";

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function contactUrl(
  whatsapp: string,
  serviceName?: string,
  preferredUrl?: string | null
): string | null {
  if (preferredUrl) {
    try {
      const url = new URL(preferredUrl);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.toString();
      }
    } catch {
      // Use the business WhatsApp number when an optional URL is invalid.
    }
  }
  const rawPhone = whatsapp.replace(/\D/g, "");
  if (!rawPhone) return null;
  const phone = rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`;
  const message = serviceName
    ? `Olá! Gostaria de agendar ${serviceName}.`
    : `Olá! Gostaria de falar com ${serviceName ?? "a barbearia"}.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export default function PublicBusinessPage({
  profile,
}: {
  profile: PublicBusinessProfile;
}) {
  const bookableServices = useMemo(
    () =>
      profile.services.filter(
        (service) =>
          !service.direct_only &&
          (profile.barbers.length === 0 ||
            getEligibleBarbers(profile, service.id).length > 0)
      ),
    [profile]
  );
  const [serviceId, setServiceId] = useState(bookableServices[0]?.id || "");
  const [selectedBarberId, setSelectedBarberId] = useState("");
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [times, setTimes] = useState<string[]>([]);
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const service = bookableServices.find((item) => item.id === serviceId);
  const eligibleBarbers = service
    ? getEligibleBarbers(profile, service.id)
    : [];
  const barberId =
    eligibleBarbers.length === 1
      ? eligibleBarbers[0].id
      : selectedBarberId;
  const hasMultipleBarbers = eligibleBarbers.length > 1;

  useEffect(() => {
    if (!service || !date || (hasMultipleBarbers && !barberId)) return;
    let active = true;
    const query = new URLSearchParams({
      date,
      service_id: service.id,
    });
    if (barberId) query.set("barber_id", barberId);
    fetch(
      `/api/public/businesses/${encodeURIComponent(profile.slug)}/availability?${query}`,
      { cache: "no-store" }
    )
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          times?: string[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error || "Não foi possível carregar os horários.");
        }
        if (active) setTimes(data.times || []);
        if (active) {
          setLoadingTimes(false);
          setError("");
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setTimes([]);
          setLoadingTimes(false);
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Não foi possível carregar os horários."
          );
        }
      });
    return () => {
      active = false;
    };
  }, [
    barberId,
    date,
    hasMultipleBarbers,
    profile.slug,
    refresh,
    service,
  ]);

  function chooseService(nextServiceId: string) {
    const nextEligibleBarbers = getEligibleBarbers(profile, nextServiceId);
    setServiceId(nextServiceId);
    setSelectedBarberId("");
    setSelectedAddonIds([]);
    setTimes([]);
    setTime("");
    setError("");
    setSuccess("");
    setLoadingTimes(Boolean(date && nextEligibleBarbers.length <= 1));
  }

  function toggleAddon(addonId: string) {
    setSelectedAddonIds((current) =>
      current.includes(addonId)
        ? current.filter((id) => id !== addonId)
        : [...current, addonId]
    );
    setTime("");
    setSuccess("");
    setLoadingTimes(Boolean(date && service));
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!service) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(
        `/api/public/businesses/${encodeURIComponent(profile.slug)}/appointments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            phone,
            service_id: service.id,
            barber_id: barberId || null,
            addon_ids: selectedAddonIds,
            date,
            time,
          }),
          cache: "no-store",
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        appointment?: { date: string; time: string; service: string };
        error?: string;
      };
      if (!response.ok || !data.appointment) {
        if (response.status === 409) {
          setTime("");
          setRefresh((current) => current + 1);
        }
        throw new Error(data.error || "Não foi possível concluir o agendamento.");
      }
      setSuccess(
        `Agendamento confirmado: ${data.appointment.service}, ${data.appointment.date} às ${data.appointment.time}.`
      );
      setTime("");
      setLoadingTimes(true);
      setRefresh((current) => current + 1);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível concluir o agendamento."
      );
    } finally {
      setSaving(false);
    }
  }

  const primaryContact = contactUrl(profile.whatsapp);

  return (
    <main className="min-h-screen bg-[#0b0c0f] px-4 py-8 text-white sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white" href="/">
            <span aria-hidden="true">←</span> Kode Barber
          </Link>
          <span className="text-xs text-zinc-600">Agendamento online</span>
        </header>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#111318]">
          <div className="border-b border-white/8 bg-gradient-to-br from-amber-300/[0.08] to-transparent p-6 sm:p-10">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400 text-xl font-black text-zinc-950">
                {profile.name
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0].toUpperCase())
                  .join("")}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
                  Barbearia
                </p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  {profile.name}
                </h1>
              </div>
              {primaryContact && (
                <a
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-emerald-300/30 hover:text-emerald-200"
                  href={primaryContact}
                  rel="noreferrer"
                  target="_blank"
                >
                  Falar no WhatsApp
                </a>
              )}
            </div>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-zinc-400">
              Escolha um serviço, o barbeiro e um horário disponível para fazer
              seu agendamento.
            </p>
          </div>

          {profile.status !== "active" ? (
            <div className="p-6 sm:p-10">
              <h2 className="text-lg font-semibold text-white">
                {profile.status === "suspended"
                  ? "Agendamentos temporariamente indisponíveis"
                  : "Estamos preparando os agendamentos"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Entre em contato com a barbearia pelo WhatsApp para saber mais.
              </p>
            </div>
          ) : profile.services.length === 0 ? (
            <div className="p-6 sm:p-10">
              <h2 className="text-lg font-semibold text-white">
                Agendamentos em configuração
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                A barbearia ainda está cadastrando os serviços e horários de
                funcionamento. Enquanto isso, fale diretamente com a equipe.
              </p>
              {primaryContact && (
                <a
                  className="mt-5 inline-flex rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
                  href={primaryContact}
                  rel="noreferrer"
                  target="_blank"
                >
                  Consultar pelo WhatsApp
                </a>
              )}
            </div>
          ) : (
            <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_1.2fr]">
              <section>
                <h2 className="text-lg font-semibold text-white">
                  Serviços disponíveis
                </h2>
                <div className="mt-4 space-y-3">
                  {profile.services.map((item) => {
                    const itemPromotion = getCurrentPromotion(item);
                    const directUrl = contactUrl(
                      profile.whatsapp,
                      item.name,
                      item.direct_contact_url
                    );
                    return (
                      <article
                        className="rounded-2xl border border-white/8 bg-white/[0.02] p-4"
                        key={item.id}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-medium text-zinc-100">
                              {item.name}
                            </h3>
                            {item.description && (
                              <p className="mt-1 text-xs leading-5 text-zinc-500">
                                {item.description}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            {itemPromotion && (
                              <span className="block text-[10px] font-medium text-amber-300">
                                {itemPromotion.label}
                              </span>
                            )}
                            <span className="text-sm font-semibold text-white">
                              {formatCurrency(getCurrentServicePrice(item))}
                            </span>
                          </div>
                        </div>
                        {item.direct_only && directUrl && (
                          <a
                            className="mt-3 inline-flex text-xs font-medium text-amber-300 hover:text-amber-200"
                            href={directUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Agendar direto com a barbearia →
                          </a>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>

              {bookableServices.length > 0 && profile.hours.length > 0 ? (
                <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 sm:p-6">
                  <h2 className="text-lg font-semibold text-white">
                    Agende seu horário
                  </h2>
                  <form className="mt-5 space-y-4" onSubmit={submitBooking}>
                    <label className="block text-sm font-medium text-zinc-300">
                      Serviço
                      <select
                        className={fieldClass}
                        onChange={(event) => chooseService(event.target.value)}
                        required
                        value={serviceId}
                      >
                        {bookableServices.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} · {formatCurrency(getCurrentServicePrice(item))}
                          </option>
                        ))}
                      </select>
                    </label>

                    {service && eligibleBarbers.length > 1 && (
                      <label className="block text-sm font-medium text-zinc-300">
                        Barbeiro
                        <select
                          className={fieldClass}
                          onChange={(event) => {
                            setSelectedBarberId(event.target.value);
                            setTimes([]);
                            setTime("");
                            setError("");
                            setLoadingTimes(Boolean(date && service));
                          }}
                          required
                          value={selectedBarberId}
                        >
                          <option value="">Selecione um barbeiro</option>
                          {eligibleBarbers.map((barber) => (
                            <option key={barber.id} value={barber.id}>
                              {barber.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {service && service.addons.length > 0 && (
                      <fieldset>
                        <legend className="text-sm font-medium text-zinc-300">
                          Adicionais
                        </legend>
                        <div className="mt-2 space-y-2">
                          {service.addons.map((addon) => (
                            <label
                              className="flex items-center gap-3 rounded-xl border border-white/8 px-3 py-2.5 text-sm text-zinc-300"
                              key={addon.id}
                            >
                              <input
                                checked={selectedAddonIds.includes(addon.id)}
                                className="accent-amber-400"
                                onChange={() => toggleAddon(addon.id)}
                                type="checkbox"
                              />
                              <span className="flex-1">{addon.name}</span>
                              <span>{formatCurrency(addon.price_cents)}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    )}

                    <label className="block text-sm font-medium text-zinc-300">
                      Data
                      <input
                        className={fieldClass}
                        onChange={(event) => {
                          setDate(event.target.value);
                          setTimes([]);
                          setTime("");
                          setError("");
                          setSuccess("");
                          setLoadingTimes(
                            Boolean(
                              event.target.value &&
                                service &&
                                (!hasMultipleBarbers || barberId)
                            )
                          );
                        }}
                        required
                        type="date"
                        value={date}
                      />
                    </label>

                    {date && (
                      <fieldset>
                        <legend className="text-sm font-medium text-zinc-300">
                          Horários disponíveis
                        </legend>
                        {hasMultipleBarbers && !barberId ? (
                          <p className="mt-2 text-xs text-zinc-500">
                            Selecione um barbeiro para consultar os horários.
                          </p>
                        ) : loadingTimes ? (
                          <p className="mt-2 text-xs text-zinc-500">
                            Consultando horários...
                          </p>
                        ) : times.length > 0 ? (
                          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {times.map((availableTime) => (
                              <button
                                aria-pressed={time === availableTime}
                                className={`rounded-lg border px-3 py-2 text-sm transition ${
                                  time === availableTime
                                    ? "border-amber-300 bg-amber-300 text-zinc-950"
                                    : "border-white/10 bg-white/[0.02] text-zinc-200 hover:border-amber-300/40"
                                }`}
                                key={availableTime}
                                onClick={() => setTime(availableTime)}
                                type="button"
                              >
                                {availableTime}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-zinc-500">
                            Não há horários disponíveis nesta data.
                          </p>
                        )}
                      </fieldset>
                    )}

                    <label className="block text-sm font-medium text-zinc-300">
                      Seu nome
                      <input
                        autoComplete="name"
                        className={fieldClass}
                        maxLength={60}
                        onChange={(event) => setName(event.target.value)}
                        required
                        value={name}
                      />
                    </label>
                    <label className="block text-sm font-medium text-zinc-300">
                      Telefone com DDD
                      <input
                        autoComplete="tel"
                        className={fieldClass}
                        inputMode="tel"
                        maxLength={15}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="(31) 99999-9999"
                        required
                        value={phone}
                      />
                    </label>

                    {(error || success) && (
                      <p
                        aria-live="polite"
                        className={`rounded-xl border px-3.5 py-3 text-sm ${
                          error
                            ? "border-rose-400/20 bg-rose-400/10 text-rose-300"
                            : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                        }`}
                      >
                        {error || success}
                      </p>
                    )}
                    <button
                      className="w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={
                        saving ||
                        !service ||
                        !date ||
                        !time ||
                        !name.trim() ||
                        !phone.trim() ||
                        (hasMultipleBarbers && !barberId)
                      }
                      type="submit"
                    >
                      {saving ? "Confirmando..." : "Confirmar agendamento"}
                    </button>
                  </form>
                </section>
              ) : (
                <p className="rounded-2xl border border-white/8 p-5 text-sm text-zinc-400">
                  {profile.hours.length === 0
                    ? "Os horários de funcionamento ainda não foram configurados. Entre em contato com a barbearia pelo WhatsApp."
                    : "Os serviços disponíveis para agendamento online ainda não foram cadastrados."}
                </p>
              )}
            </div>
          )}
        </section>
        <footer className="mt-6 text-center text-xs text-zinc-600">
          Agendamento online · {profile.name}
        </footer>
      </div>
    </main>
  );
}
