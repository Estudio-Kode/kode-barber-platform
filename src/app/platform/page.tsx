"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type {
  PlatformBusinessRow,
  PlatformFeature,
  PlatformPlanRow,
} from "@/lib/supabase-server";
import {
  isStrongPassword,
  PASSWORD_REQUIREMENTS,
} from "@/lib/password-policy";

type Section = "overview" | "businesses" | "plans";
type PlatformBusinessStatus = PlatformBusinessRow["status"];
type DialogState =
  | { kind: "business"; item: PlatformBusinessRow | null }
  | { kind: "admin"; item: PlatformBusinessRow }
  | { kind: "plan"; item: PlatformPlanRow | null }
  | null;

const FEATURES: Array<{ key: PlatformFeature; label: string }> = [
  { key: "online_booking", label: "Agendamento online" },
  { key: "multiple_barbers", label: "Mais de um barbeiro" },
  { key: "advanced_reports", label: "Relatórios avançados" },
  { key: "client_memberships", label: "Planos para clientes" },
  { key: "product_catalog", label: "Catálogo de produtos" },
];

const EMPTY_FEATURES: Record<PlatformFeature, boolean> = {
  online_booking: true,
  multiple_barbers: false,
  advanced_reports: false,
  client_memberships: false,
  product_catalog: false,
};

const inputClass =
  "mt-1.5 w-full rounded-xl border border-white/10 bg-[#15171c] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400/70";
const labelClass = "block text-sm font-medium text-zinc-300";

function formatCurrency(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "Sob consulta";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(
    new Date(value)
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;
  if (!response.ok) {
    throw new Error(data.error || "Não foi possível concluir a operação.");
  }
  return data;
}

function StatusBadge({ status }: { status: PlatformBusinessStatus }) {
  const labels = {
    setup: "Em configuração",
    active: "Ativa",
    suspended: "Suspensa",
  };
  const colors = {
    setup: "border-amber-400/20 bg-amber-400/10 text-amber-300",
    active: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    suspended: "border-rose-400/20 bg-rose-400/10 text-rose-300",
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${colors[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function BusinessDialog({
  business,
  plans,
  saving,
  error,
  onClose,
  onSave,
}: {
  business: PlatformBusinessRow | null;
  plans: PlatformPlanRow[];
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (values: {
    name: string;
    slug: string;
    owner_name: string;
    email: string;
    whatsapp: string;
    plan_id: string;
    status?: PlatformBusinessStatus;
  }) => void;
}) {
  const [name, setName] = useState(business?.name || "");
  const [slug, setSlug] = useState(business?.slug || "");
  const [ownerName, setOwnerName] = useState(business?.owner_name || "");
  const [email, setEmail] = useState(business?.email || "");
  const [whatsapp, setWhatsapp] = useState(business?.whatsapp || "");
  const [planId, setPlanId] = useState(
    business?.plan_id || plans.find((plan) => plan.active)?.id || ""
  );
  const [status, setStatus] = useState<PlatformBusinessStatus>(
    business?.status || "setup"
  );
  const availablePlans = plans.filter(
    (plan) => plan.active || plan.id === business?.plan_id
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      name: name.trim(),
      slug: slug.trim(),
      owner_name: ownerName.trim(),
      email: email.trim(),
      whatsapp: whatsapp.trim(),
      plan_id: planId,
      ...(business ? { status } : {}),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="business-dialog-title"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-white/10 bg-[#101216] p-6 shadow-2xl sm:p-8"
        role="dialog"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
              Cadastro da plataforma
            </p>
            <h2
              className="mt-2 text-2xl font-semibold tracking-tight text-white"
              id="business-dialog-title"
            >
              {business ? "Editar barbearia" : "Nova barbearia"}
            </h2>
          </div>
          <button
            aria-label="Fechar"
            className="rounded-lg px-2 py-1 text-xl text-zinc-500 hover:bg-white/5 hover:text-white"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <label className={labelClass}>
            Nome da barbearia
            <input
              className={inputClass}
              onChange={(event) => {
                const nextName = event.target.value;
                setName(nextName);
                if (!business) setSlug(slugify(nextName));
              }}
              placeholder="Ex.: Barbearia Central"
              required
              value={name}
            />
          </label>
          <label className={labelClass}>
            Endereço curto
            <div className="mt-1.5 flex overflow-hidden rounded-xl border border-white/10 bg-[#15171c] focus-within:border-amber-400/70">
              <span className="flex items-center border-r border-white/10 px-3 text-sm text-zinc-500">
                /b/
              </span>
              <input
                className="w-full bg-transparent px-3 py-3 text-sm text-white outline-none placeholder:text-zinc-600"
                onChange={(event) => setSlug(slugify(event.target.value))}
                placeholder="barbearia-central"
                required
                value={slug}
              />
            </div>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Responsável
              <input
                className={inputClass}
                onChange={(event) => setOwnerName(event.target.value)}
                placeholder="Nome do responsável"
                required
                value={ownerName}
              />
            </label>
            <label className={labelClass}>
              WhatsApp
              <input
                className={inputClass}
                inputMode="tel"
                onChange={(event) => setWhatsapp(event.target.value)}
                placeholder="(31) 99999-9999"
                required
                value={whatsapp}
              />
            </label>
          </div>
          <label className={labelClass}>
            E-mail de contato <span className="font-normal text-zinc-500">· opcional</span>
            <input
              className={inputClass}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="contato@barbearia.com.br"
              type="email"
              value={email}
            />
          </label>
          <label className={labelClass}>
            Plano da plataforma
            <select
              className={inputClass}
              onChange={(event) => setPlanId(event.target.value)}
              required
              value={planId}
            >
              {availablePlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} · {formatCurrency(plan.price_cents)}
                </option>
              ))}
            </select>
          </label>
          {business && (
            <label className={labelClass}>
              Acesso
              <select
                className={inputClass}
                onChange={(event) =>
                  setStatus(event.target.value as PlatformBusinessStatus)
                }
                value={status}
              >
                <option value="setup">Em configuração</option>
                <option value="active">Ativa</option>
                <option value="suspended">Suspensa</option>
              </select>
            </label>
          )}
          {error && (
            <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-300">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3 border-t border-white/8 pt-5">
            <button
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-white"
              onClick={onClose}
              type="button"
            >
              Voltar
            </button>
            <button
              className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving || availablePlans.length === 0}
              type="submit"
            >
              {saving ? "Salvando..." : business ? "Salvar alterações" : "Cadastrar"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function BusinessAdminDialog({
  business,
  saving,
  error,
  onClose,
  onSave,
}: {
  business: PlatformBusinessRow;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (values: {
    email: string;
    full_name: string;
    password: string;
  }) => void;
}) {
  const existingAdmin = business.business_members?.find(
    (member) => member.role === "owner" && member.active
  );
  const [email, setEmail] = useState(
    existingAdmin?.login_email || business.email || ""
  );
  const [fullName, setFullName] = useState(business.owner_name);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isStrongPassword(password)) {
      setFormError(PASSWORD_REQUIREMENTS);
      return;
    }
    if (password !== confirmPassword) {
      setFormError("As senhas informadas não correspondem.");
      return;
    }
    setFormError("");
    onSave({ email: email.trim(), full_name: fullName.trim(), password });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="admin-dialog-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#101216] p-6 shadow-2xl sm:p-8"
        role="dialog"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
              Acesso da empresa
            </p>
            <h2
              className="mt-2 text-2xl font-semibold tracking-tight text-white"
              id="admin-dialog-title"
            >
              Configurar administrador
            </h2>
            <p className="mt-2 text-sm text-zinc-500">{business.name}</p>
          </div>
          <button
            aria-label="Fechar"
            className="rounded-lg px-2 py-1 text-xl text-zinc-500 hover:bg-white/5 hover:text-white"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <label className={labelClass}>
            Nome do administrador
            <input
              autoComplete="name"
              className={inputClass}
              onChange={(event) => setFullName(event.target.value)}
              required
              value={fullName}
            />
          </label>
          <label className={labelClass}>
            E-mail de acesso
            <input
              autoComplete="username"
              className={inputClass}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className={labelClass}>
            Senha temporária
            <input
              autoComplete="new-password"
              className={inputClass}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            <span className="mt-1 block text-xs font-normal text-zinc-500">
              {PASSWORD_REQUIREMENTS}
            </span>
          </label>
          <label className={labelClass}>
            Confirmar senha temporária
            <input
              autoComplete="new-password"
              className={inputClass}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              type="password"
              value={confirmPassword}
            />
          </label>
          <p className="rounded-xl border border-amber-400/15 bg-amber-400/[0.05] px-3.5 py-3 text-xs leading-5 text-amber-100/80">
            A senha será solicitada apenas uma vez e não será enviada por
            e-mail. Entregue-a diretamente ao responsável, que deverá
            substituí-la no primeiro acesso.
          </p>
          {(error || formError) && (
            <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-300">
              {error || formError}
            </p>
          )}
          <div className="flex justify-end gap-3 border-t border-white/8 pt-5">
            <button
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-white"
              onClick={onClose}
              type="button"
            >
              Voltar
            </button>
            <button
              className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? "Configurando..." : "Salvar acesso"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PlanDialog({
  plan,
  saving,
  error,
  onClose,
  onSave,
}: {
  plan: PlatformPlanRow | null;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (values: {
    name: string;
    slug: string;
    description: string;
    price_cents: number | null;
    max_barbers: number;
    max_services: number | null;
    max_products: number | null;
    features: Record<PlatformFeature, boolean>;
  }) => void;
}) {
  const [name, setName] = useState(plan?.name || "");
  const [slug, setSlug] = useState(plan?.slug || "");
  const [description, setDescription] = useState(plan?.description || "");
  const [price, setPrice] = useState(
    plan?.price_cents === null || plan?.price_cents === undefined
      ? ""
      : (plan.price_cents / 100).toFixed(2).replace(".", ",")
  );
  const [maxBarbers, setMaxBarbers] = useState(
    String(plan?.max_barbers ?? 1)
  );
  const [maxServices, setMaxServices] = useState(
    plan?.max_services === null ? "" : String(plan?.max_services ?? 20)
  );
  const [maxProducts, setMaxProducts] = useState(
    plan?.max_products === null ? "" : String(plan?.max_products ?? 0)
  );
  const [formError, setFormError] = useState("");
  const [features, setFeatures] = useState<Record<PlatformFeature, boolean>>({
    ...EMPTY_FEATURES,
    ...plan?.features,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPrice = price.trim().replace(",", ".");
    if (
      normalizedPrice &&
      (!/^\d+(?:\.\d{1,2})?$/.test(normalizedPrice) ||
        !Number.isFinite(Number(normalizedPrice)))
    ) {
      setFormError("Informe um valor válido, com até duas casas decimais.");
      return;
    }
    if (
      !Number.isInteger(Number(maxBarbers)) ||
      Number(maxBarbers) < 1 ||
      (maxServices !== "" &&
        (!Number.isInteger(Number(maxServices)) || Number(maxServices) < 1)) ||
      (maxProducts !== "" &&
        (!Number.isInteger(Number(maxProducts)) || Number(maxProducts) < 0))
    ) {
      setFormError("Confira os limites de barbeiros, serviços e produtos.");
      return;
    }
    setFormError("");
    const parsedPrice = normalizedPrice
      ? Math.round(Number(normalizedPrice) * 100)
      : null;
    onSave({
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim(),
      price_cents: parsedPrice,
      max_barbers: Number(maxBarbers),
      max_services: maxServices ? Number(maxServices) : null,
      max_products: maxProducts ? Number(maxProducts) : null,
      features,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="plan-dialog-title"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-[#101216] p-6 shadow-2xl sm:p-8"
        role="dialog"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
              Oferta comercial
            </p>
            <h2
              className="mt-2 text-2xl font-semibold tracking-tight text-white"
              id="plan-dialog-title"
            >
              {plan ? "Editar plano" : "Novo plano"}
            </h2>
          </div>
          <button
            aria-label="Fechar"
            className="rounded-lg px-2 py-1 text-xl text-zinc-500 hover:bg-white/5 hover:text-white"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Nome do plano
              <input
                className={inputClass}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!plan) setSlug(slugify(event.target.value));
                }}
                placeholder="Ex.: Profissional"
                required
                value={name}
              />
            </label>
            <label className={labelClass}>
              Identificador
              <input
                className={inputClass}
                onChange={(event) => setSlug(slugify(event.target.value))}
                placeholder="profissional"
                required
                value={slug}
              />
            </label>
          </div>
          <label className={labelClass}>
            Descrição
            <textarea
              className={`${inputClass} min-h-20 resize-y`}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Resumo do que este plano oferece"
              value={description}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className={labelClass}>
              Mensalidade em R$
              <input
                className={inputClass}
                inputMode="decimal"
                onChange={(event) => setPrice(event.target.value)}
                placeholder="Não divulgar"
                value={price}
              />
              <span className="mt-1 block text-xs font-normal text-zinc-500">
                Deixe vazio para não divulgar o valor.
              </span>
            </label>
            <label className={labelClass}>
              Máximo de barbeiros
              <input
                className={inputClass}
                min="1"
                onChange={(event) => setMaxBarbers(event.target.value)}
                required
                type="number"
                value={maxBarbers}
              />
            </label>
            <label className={labelClass}>
              Limite de serviços
              <input
                className={inputClass}
                min="1"
                onChange={(event) => setMaxServices(event.target.value)}
                placeholder="Sem limite"
                type="number"
                value={maxServices}
              />
            </label>
          </div>
          <label className={`${labelClass} max-w-xs`}>
            Limite de produtos
            <input
              className={inputClass}
              min="0"
              onChange={(event) => setMaxProducts(event.target.value)}
              placeholder="Sem catálogo"
              type="number"
              value={maxProducts}
            />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-zinc-300">
              Recursos incluídos
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {FEATURES.map((feature) => (
                <label
                  className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-3 text-sm text-zinc-300"
                  key={feature.key}
                >
                  <input
                    checked={features[feature.key]}
                    className="accent-amber-400"
                    onChange={(event) =>
                      setFeatures((current) => ({
                        ...current,
                        [feature.key]: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  {feature.label}
                </label>
              ))}
            </div>
          </fieldset>
          {(error || formError) && (
            <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-300">
              {error || formError}
            </p>
          )}
          <div className="flex justify-end gap-3 border-t border-white/8 pt-5">
            <button
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-white"
              onClick={onClose}
              type="button"
            >
              Voltar
            </button>
            <button
              className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? "Salvando..." : plan ? "Salvar alterações" : "Criar plano"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function PlatformPage() {
  const [stage, setStage] = useState<"loading" | "login" | "app">("loading");
  const [section, setSection] = useState<Section>("overview");
  const [businesses, setBusinesses] = useState<PlatformBusinessRow[]>([]);
  const [plans, setPlans] = useState<PlatformPlanRow[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [loginUser, setLoginUser] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");

  const loadData = useCallback(async () => {
    const [businessData, planData] = await Promise.all([
      requestJson<{ businesses: PlatformBusinessRow[] }>(
        "/api/platform/businesses"
      ),
      requestJson<{ plans: PlatformPlanRow[] }>("/api/platform/plans"),
    ]);
    setBusinesses(businessData.businesses);
    setPlans(planData.plans);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/platform/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          if (active) setStage("login");
          return;
        }
        await loadData();
        if (active) setStage("app");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(
          error instanceof Error ? error.message : "Falha ao carregar o painel."
        );
        setStage("app");
      });
    return () => {
      active = false;
    };
  }, [loadData]);

  const filteredBusinesses = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return businesses;
    return businesses.filter((business) =>
      [
        business.name,
        business.owner_name,
        business.email,
        business.slug,
      ].some((value) => value.toLowerCase().includes(query))
    );
  }, [businesses, search]);

  const activeBusinesses = businesses.filter(
    (business) => business.status === "active"
  );
  const setupBusinesses = businesses.filter(
    (business) => business.status === "setup"
  );
  const suspendedBusinesses = businesses.filter(
    (business) => business.status === "suspended"
  );
  const monthlyValue = activeBusinesses.reduce((total, business) => {
    const price = business.plan_price_cents ?? business.platform_plans?.price_cents;
    return total + (price ?? 0);
  }, 0);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      await requestJson("/api/platform/login", {
        method: "POST",
        body: JSON.stringify({
          username: loginUser.trim(),
          password: loginPassword,
        }),
      });
      await loadData();
      setStage("app");
      setLoginPassword("");
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : "Não foi possível entrar."
      );
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/platform/session", { method: "POST" });
    setStage("login");
    setBusinesses([]);
    setPlans([]);
  }

  async function saveBusiness(values: {
    name: string;
    slug: string;
    owner_name: string;
    email: string;
    whatsapp: string;
    plan_id: string;
    status?: PlatformBusinessStatus;
  }) {
    if (!dialog || dialog.kind !== "business") return;
    setSaving(true);
    setDialogError("");
    try {
      const isEditing = Boolean(dialog.item);
      const requestValues =
        isEditing && dialog.item?.plan_id === values.plan_id
          ? { ...values, plan_id: undefined }
          : values;
      await requestJson(
        isEditing
          ? `/api/platform/businesses/${dialog.item?.id}`
          : "/api/platform/businesses",
        {
          method: isEditing ? "PATCH" : "POST",
          body: JSON.stringify(requestValues),
        }
      );
      await loadData();
      setDialog(null);
      setNotice(isEditing ? "Barbearia atualizada." : "Barbearia cadastrada.");
      window.setTimeout(() => setNotice(""), 3200);
    } catch (error) {
      setDialogError(
        error instanceof Error ? error.message : "Não foi possível salvar."
      );
    } finally {
      setSaving(false);
    }
  }

  async function savePlan(values: {
    name: string;
    slug: string;
    description: string;
    price_cents: number | null;
    max_barbers: number;
    max_services: number | null;
    max_products: number | null;
    features: Record<PlatformFeature, boolean>;
  }) {
    if (!dialog || dialog.kind !== "plan") return;
    setSaving(true);
    setDialogError("");
    try {
      const isEditing = Boolean(dialog.item);
      await requestJson("/api/platform/plans", {
        method: isEditing ? "PATCH" : "POST",
        body: JSON.stringify(
          isEditing
            ? { ...values, id: dialog.item?.id }
            : { ...values, sort_order: plans.length }
        ),
      });
      await loadData();
      setDialog(null);
      setNotice(isEditing ? "Plano atualizado." : "Plano criado.");
      window.setTimeout(() => setNotice(""), 3200);
    } catch (error) {
      setDialogError(
        error instanceof Error ? error.message : "Não foi possível salvar."
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveBusinessAdmin(values: {
    email: string;
    full_name: string;
    password: string;
  }) {
    if (!dialog || dialog.kind !== "admin") return;
    setSaving(true);
    setDialogError("");
    try {
      await requestJson(`/api/platform/businesses/${dialog.item.id}/admin`, {
        method: "PUT",
        body: JSON.stringify(values),
      });
      await loadData();
      setDialog(null);
      setNotice(`Acesso de ${values.email} configurado. Entregue a senha temporária diretamente ao responsável.`);
      window.setTimeout(() => setNotice(""), 6000);
    } catch (error) {
      setDialogError(
        error instanceof Error
          ? error.message
          : "Não foi possível configurar o acesso."
      );
    } finally {
      setSaving(false);
    }
  }

  async function togglePlan(plan: PlatformPlanRow) {
    try {
      await requestJson("/api/platform/plans", {
        method: "PATCH",
        body: JSON.stringify({ id: plan.id, active: !plan.active }),
      });
      await loadData();
      setNotice(plan.active ? "Plano desativado." : "Plano reativado.");
      window.setTimeout(() => setNotice(""), 3200);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Não foi possível atualizar."
      );
    }
  }

  if (stage === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0c0f] text-zinc-400">
        <div className="flex items-center gap-3 text-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          Abrindo central de controle...
        </div>
      </main>
    );
  }

  if (stage === "login") {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0c0f] px-4 py-12 text-white">
        <div className="absolute -left-32 top-[-10rem] h-[28rem] w-[28rem] rounded-full bg-amber-400/10 blur-[120px]" />
        <div className="absolute -bottom-48 -right-24 h-[32rem] w-[32rem] rounded-full bg-indigo-400/10 blur-[140px]" />
        <div className="relative w-full max-w-md">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-lg font-black text-zinc-950">
              K
            </div>
            <div>
              <p className="text-sm font-bold tracking-[0.2em]">KODE</p>
              <p className="mt-0.5 text-xs text-zinc-500">PAINEL DA PLATAFORMA</p>
            </div>
          </div>
          <form
            className="rounded-3xl border border-white/10 bg-[#111318]/90 p-7 shadow-2xl backdrop-blur-xl sm:p-9"
            onSubmit={handleLogin}
          >
            <p className="text-sm font-medium text-amber-300">
              Acesso administrativo
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Bom ter você de volta.
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Gerencie as barbearias, os planos e o acesso à plataforma.
            </p>
            <label className={`${labelClass} mt-7`}>
              Usuário
              <input
                autoComplete="username"
                className={inputClass}
                onChange={(event) => setLoginUser(event.target.value)}
                required
                value={loginUser}
              />
            </label>
            <label className={`${labelClass} mt-4`}>
              Senha
              <input
                autoComplete="current-password"
                className={inputClass}
                onChange={(event) => setLoginPassword(event.target.value)}
                required
                type="password"
                value={loginPassword}
              />
            </label>
            {loginError && (
              <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-300">
                {loginError}
              </p>
            )}
            <button
              className="mt-6 w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loginLoading}
              type="submit"
            >
              {loginLoading ? "Validando acesso..." : "Entrar na plataforma"}
            </button>
            <p className="mt-5 text-center text-xs leading-5 text-zinc-600">
              Acesso restrito à administração do sistema.
            </p>
          </form>
        </div>
      </main>
    );
  }

  const sectionTitles: Record<Section, { title: string; caption: string }> = {
    overview: {
      title: "Visão geral",
      caption: "Uma visão simples da operação da plataforma.",
    },
    businesses: {
      title: "Barbearias",
      caption: "Cadastre empresas, configure o plano e controle o acesso.",
    },
    plans: {
      title: "Planos da plataforma",
      caption: "Defina os recursos e limites de cada assinatura.",
    },
  };

  return (
    <main className="min-h-screen bg-[#0b0c0f] text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-64 shrink-0 border-r border-white/6 bg-[#0e1014] px-5 py-6 lg:flex lg:flex-col">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-base font-black text-zinc-950">
              K
            </div>
            <div>
              <p className="text-sm font-bold tracking-[0.16em]">KODE</p>
              <p className="mt-0.5 text-[10px] tracking-[0.12em] text-zinc-500">
                PLATFORM CONTROL
              </p>
            </div>
          </div>

          <div className="mt-11 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
            Workspace
          </div>
          <nav aria-label="Navegação da plataforma" className="mt-3 space-y-1">
            {(
              [
                ["overview", "Visão geral", "◫"],
                ["businesses", "Barbearias", "▦"],
                ["plans", "Planos", "◇"],
              ] as Array<[Section, string, string]>
            ).map(([key, title, icon]) => (
              <button
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  section === key
                    ? "bg-amber-400/10 font-medium text-amber-200"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white"
                }`}
                key={key}
                onClick={() => {
                  setSection(key);
                  setLoadError("");
                }}
                type="button"
              >
                <span className="w-5 text-center text-base">{icon}</span>
                {title}
              </button>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl border border-white/7 bg-white/[0.025] p-4">
            <p className="text-xs font-medium text-zinc-300">Base multiempresa</p>
            <p className="mt-1.5 text-xs leading-5 text-zinc-500">
              Cada barbearia possui dados e plano próprios.
            </p>
            <span className="mt-3 inline-flex items-center gap-2 text-[11px] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Ambiente protegido
            </span>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-[74px] items-center justify-between border-b border-white/6 bg-[#0b0c0f]/90 px-5 backdrop-blur-xl sm:px-8">
            <div>
              <p className="text-xs text-zinc-500">Kode / Plataforma</p>
              <h1 className="mt-0.5 text-sm font-semibold text-zinc-100">
                Central de controle
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-xs font-medium text-zinc-300">Administrador</p>
                <p className="mt-0.5 text-[10px] text-zinc-600">Conta da plataforma</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-400/20 bg-amber-400/10 text-xs font-semibold text-amber-200">
                K
              </div>
              <button
                className="rounded-lg border border-white/8 px-3 py-2 text-xs font-medium text-zinc-400 transition hover:border-white/15 hover:text-white"
                onClick={handleLogout}
                type="button"
              >
                Sair
              </button>
            </div>
          </header>

          <div className="border-b border-white/6 bg-[#0e1014] px-5 py-2 lg:hidden">
            <nav className="flex gap-2 overflow-x-auto" aria-label="Navegação">
              {(
                [
                  ["overview", "Visão geral"],
                  ["businesses", "Barbearias"],
                  ["plans", "Planos"],
                ] as Array<[Section, string]>
              ).map(([key, title]) => (
                <button
                  className={`shrink-0 rounded-lg px-3 py-2 text-xs ${
                    section === key
                      ? "bg-amber-400/10 text-amber-200"
                      : "text-zinc-400"
                  }`}
                  key={key}
                  onClick={() => setSection(key)}
                  type="button"
                >
                  {title}
                </button>
              ))}
            </nav>
          </div>

          <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-8 sm:py-10">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
                  Operação
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                  {sectionTitles[section].title}
                </h2>
                <p className="mt-2 text-sm text-zinc-500">
                  {sectionTitles[section].caption}
                </p>
              </div>
              {section === "businesses" && (
                <button
                  className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
                  onClick={() => {
                    setDialogError("");
                    setDialog({ kind: "business", item: null });
                  }}
                  type="button"
                >
                  + Nova barbearia
                </button>
              )}
              {section === "plans" && (
                <button
                  className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
                  onClick={() => {
                    setDialogError("");
                    setDialog({ kind: "plan", item: null });
                  }}
                  type="button"
                >
                  + Criar plano
                </button>
              )}
            </div>

            {notice && (
              <div className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                {notice}
              </div>
            )}
            {loadError && (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                <span>{loadError}</span>
                <button
                  className="font-medium underline underline-offset-4"
                  onClick={() => {
                    setLoadError("");
                    loadData().catch((error: unknown) =>
                      setLoadError(
                        error instanceof Error
                          ? error.message
                          : "Falha ao carregar os dados."
                      )
                    );
                  }}
                  type="button"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {section === "overview" && (
              <section aria-label="Indicadores da plataforma">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      label: "Barbearias cadastradas",
                      value: businesses.length,
                      hint: `${activeBusinesses.length} com acesso ativo`,
                      mark: "01",
                    },
                    {
                      label: "Em configuração",
                      value: setupBusinesses.length,
                      hint: "Aguardando liberação",
                      mark: "02",
                    },
                    {
                      label: "Acessos suspensos",
                      value: suspendedBusinesses.length,
                      hint: "Requerem acompanhamento",
                      mark: "03",
                    },
                    {
                      label: "Receita mensal prevista",
                      value: formatCurrency(monthlyValue),
                      hint: "Somente planos com valor definido",
                      mark: "04",
                    },
                  ].map((card) => (
                    <article
                      className="rounded-2xl border border-white/7 bg-[#111318] p-5"
                      key={card.label}
                    >
                      <div className="flex items-start justify-between">
                        <p className="text-sm text-zinc-400">{card.label}</p>
                        <span className="text-[10px] font-medium tracking-widest text-zinc-700">
                          {card.mark}
                        </span>
                      </div>
                      <p className="mt-5 text-3xl font-semibold tracking-tight text-white">
                        {card.value}
                      </p>
                      <p className="mt-2 text-xs text-zinc-600">{card.hint}</p>
                    </article>
                  ))}
                </div>

                <div className="mt-6 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
                  <section className="rounded-2xl border border-white/7 bg-[#111318] p-5 sm:p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-white">
                          Barbearias recentes
                        </h3>
                        <p className="mt-1 text-xs text-zinc-500">
                          Cadastros e acessos recentes.
                        </p>
                      </div>
                      <button
                        className="text-xs font-medium text-amber-300 hover:text-amber-200"
                        onClick={() => setSection("businesses")}
                        type="button"
                      >
                        Ver todas →
                      </button>
                    </div>
                    <div className="mt-5 divide-y divide-white/5">
                      {businesses.slice(0, 5).map((business) => (
                        <div
                          className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0"
                          key={business.id}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-xs font-semibold text-zinc-300">
                            {initials(business.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-zinc-200">
                              {business.name}
                            </p>
                            <p className="mt-1 truncate text-xs text-zinc-600">
                              {business.platform_plans?.name || "Sem plano"}
                            </p>
                          </div>
                          <StatusBadge status={business.status} />
                        </div>
                      ))}
                      {businesses.length === 0 && (
                        <EmptyState
                          title="Nenhuma barbearia cadastrada"
                          description="Cadastre a primeira empresa para começar."
                          action="Cadastrar barbearia"
                          onAction={() =>
                            setDialog({ kind: "business", item: null })
                          }
                        />
                      )}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/7 bg-[#111318] p-5 sm:p-6">
                    <div>
                      <h3 className="text-base font-semibold text-white">
                        Distribuição por plano
                      </h3>
                      <p className="mt-1 text-xs text-zinc-500">
                        Empresas ativas em cada oferta.
                      </p>
                    </div>
                    <div className="mt-6 space-y-5">
                      {plans.filter((plan) => plan.active).map((plan) => {
                        const count = activeBusinesses.filter(
                          (business) => business.plan_id === plan.id
                        ).length;
                        const percent = activeBusinesses.length
                          ? (count / activeBusinesses.length) * 100
                          : 0;
                        return (
                          <div key={plan.id}>
                            <div className="mb-2 flex items-center justify-between text-xs">
                              <span className="text-zinc-300">{plan.name}</span>
                              <span className="text-zinc-500">
                                {count} {count === 1 ? "barbearia" : "barbearias"}
                              </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-white/6">
                              <div
                                className="h-full rounded-full bg-amber-400"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                      {plans.filter((plan) => plan.active).length === 0 && (
                        <p className="text-sm text-zinc-500">
                          Crie um plano para acompanhar a distribuição.
                        </p>
                      )}
                    </div>
                    <button
                      className="mt-7 w-full rounded-xl border border-white/8 px-4 py-2.5 text-xs font-medium text-zinc-300 transition hover:border-amber-300/30 hover:text-amber-200"
                      onClick={() => setSection("plans")}
                      type="button"
                    >
                      Gerenciar planos
                    </button>
                  </section>
                </div>
              </section>
            )}

            {section === "businesses" && (
              <section className="overflow-hidden rounded-2xl border border-white/7 bg-[#111318]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/6 p-4 sm:p-5">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Todas as barbearias
                    </h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      {businesses.length} {businesses.length === 1 ? "empresa" : "empresas"} na plataforma
                    </p>
                  </div>
                  <input
                    aria-label="Buscar barbearia"
                    className="w-full rounded-xl border border-white/8 bg-[#0d0f12] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-amber-400/60 sm:w-64"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar por nome ou responsável"
                    value={search}
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] text-left">
                    <thead>
                      <tr className="border-b border-white/6 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
                        <th className="px-5 py-3.5">Barbearia</th>
                        <th className="px-5 py-3.5">Plano</th>
                        <th className="px-5 py-3.5">Mensalidade</th>
                        <th className="px-5 py-3.5">Acesso</th>
                        <th className="px-5 py-3.5">Cadastro</th>
                        <th className="px-5 py-3.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredBusinesses.map((business) => (
                        <tr
                          className="transition hover:bg-white/[0.02]"
                          key={business.id}
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/6 bg-white/[0.04] text-xs font-semibold text-zinc-300">
                                {initials(business.name)}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-zinc-200">
                                  {business.name}
                                </p>
                                <p className="mt-1 truncate text-xs text-zinc-600">
                                  /b/{business.slug} · {business.owner_name}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm text-zinc-400">
                            {business.platform_plans?.name || "—"}
                          </td>
                          <td className="px-5 py-4 text-sm text-zinc-400">
                            {formatCurrency(
                              business.plan_price_cents ??
                                business.platform_plans?.price_cents
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <StatusBadge status={business.status} />
                          </td>
                          <td className="px-5 py-4 text-xs text-zinc-500">
                            {formatDate(business.created_at)}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                className="rounded-lg border border-white/8 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-amber-300/30 hover:text-amber-200"
                                onClick={() => {
                                  setDialogError("");
                                  setDialog({ kind: "business", item: business });
                                }}
                                type="button"
                              >
                                Editar
                              </button>
                              <button
                                className="rounded-lg border border-amber-300/20 px-3 py-2 text-xs font-medium text-amber-200 transition hover:bg-amber-300/10"
                                onClick={() => {
                                  setDialogError("");
                                  setDialog({ kind: "admin", item: business });
                                }}
                                type="button"
                              >
                                {business.business_members?.some(
                                  (member) => member.role === "owner" && member.active
                                )
                                  ? "Redefinir acesso"
                                  : "Configurar acesso"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredBusinesses.length === 0 && (
                    <div className="p-8 text-center">
                      <p className="text-sm font-medium text-zinc-300">
                        {search ? "Nenhum resultado encontrado" : "Sua lista está vazia"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        {search
                          ? "Tente buscar por outro termo."
                          : "Cadastre uma barbearia para começar."}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {section === "plans" && (
              <section>
                <div className="mb-5 rounded-2xl border border-indigo-300/10 bg-indigo-300/[0.04] px-5 py-4">
                  <p className="text-sm font-medium text-indigo-100">
                    Recursos configuráveis
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    Os limites são a base para liberar funcionalidades e equipe por assinatura. A aplicação desses limites nos módulos operacionais será conectada nas próximas etapas.
                  </p>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  {plans.map((plan) => {
                    const assigned = businesses.filter(
                      (business) => business.plan_id === plan.id
                    ).length;
                    return (
                      <article
                        className={`rounded-2xl border bg-[#111318] p-5 sm:p-6 ${
                          plan.active
                            ? "border-white/7"
                            : "border-white/5 opacity-65"
                        }`}
                        key={plan.id}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2.5">
                              <h3 className="text-lg font-semibold text-white">
                                {plan.name}
                              </h3>
                              {!plan.active && (
                                <span className="rounded-full bg-white/6 px-2 py-1 text-[10px] text-zinc-500">
                                  Desativado
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-zinc-600">
                              {plan.slug} · {assigned} {assigned === 1 ? "barbearia" : "barbearias"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-semibold text-white">
                              {formatCurrency(plan.price_cents)}
                            </p>
                            <p className="mt-1 text-[11px] text-zinc-600">
                              {plan.price_cents === null ? "valor não divulgado" : "por mês"}
                            </p>
                          </div>
                        </div>
                        {plan.description && (
                          <p className="mt-4 text-sm leading-6 text-zinc-400">
                            {plan.description}
                          </p>
                        )}
                        <div className="mt-5 grid grid-cols-3 gap-2 border-y border-white/6 py-4">
                          <div>
                            <p className="text-lg font-semibold text-zinc-100">
                              {plan.max_barbers}
                            </p>
                            <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-600">
                              Barbeiros
                            </p>
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-zinc-100">
                              {plan.max_services ?? "∞"}
                            </p>
                            <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-600">
                              Serviços
                            </p>
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-zinc-100">
                              {plan.max_products ?? "∞"}
                            </p>
                            <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-600">
                              Produtos
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {FEATURES.map((feature) => (
                            <span
                              className={`rounded-full border px-2.5 py-1 text-[11px] ${
                                plan.features?.[feature.key]
                                  ? "border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-200"
                                  : "border-white/6 text-zinc-600"
                              }`}
                              key={feature.key}
                            >
                              {plan.features?.[feature.key] ? "✓ " : "— "}
                              {feature.label}
                            </span>
                          ))}
                        </div>
                        <div className="mt-5 flex justify-end gap-2">
                          <button
                            className="rounded-lg border border-white/8 px-3 py-2 text-xs font-medium text-zinc-400 transition hover:text-white"
                            onClick={() => togglePlan(plan)}
                            type="button"
                          >
                            {plan.active ? "Desativar" : "Reativar"}
                          </button>
                          <button
                            className="rounded-lg border border-white/8 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-amber-300/30 hover:text-amber-200"
                            onClick={() => {
                              setDialogError("");
                              setDialog({ kind: "plan", item: plan });
                            }}
                            type="button"
                          >
                            Editar plano
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  {plans.length === 0 && (
                    <EmptyState
                      title="Nenhum plano criado"
                      description="Configure as ofertas que estarão disponíveis para as barbearias."
                      action="Criar primeiro plano"
                      onAction={() =>
                        setDialog({ kind: "plan", item: null })
                      }
                    />
                  )}
                </div>
              </section>
            )}

            <footer className="mt-10 border-t border-white/6 pt-5 text-xs text-zinc-700">
              Kode · Central de operação da plataforma
            </footer>
          </div>
        </div>
      </div>

      {dialog?.kind === "business" && (
        <BusinessDialog
          business={dialog.item}
          error={dialogError}
          onClose={() => setDialog(null)}
          onSave={saveBusiness}
          plans={plans}
          saving={saving}
        />
      )}
      {dialog?.kind === "admin" && (
        <BusinessAdminDialog
          business={dialog.item}
          error={dialogError}
          onClose={() => setDialog(null)}
          onSave={saveBusinessAdmin}
          saving={saving}
        />
      )}
      {dialog?.kind === "plan" && (
        <PlanDialog
          error={dialogError}
          onClose={() => setDialog(null)}
          onSave={savePlan}
          plan={dialog.item}
          saving={saving}
        />
      )}
    </main>
  );
}

function EmptyState({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-zinc-500">
        {description}
      </p>
      <button
        className="mt-4 text-xs font-semibold text-amber-300 hover:text-amber-200"
        onClick={onAction}
        type="button"
      >
        {action} →
      </button>
    </div>
  );
}
