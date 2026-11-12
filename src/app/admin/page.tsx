"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  isStrongPassword,
  PASSWORD_REQUIREMENTS,
} from "@/lib/password-policy";
import BusinessAdminDashboard from "@/app/admin/BusinessAdminDashboard";

type AdminSession = {
  authenticated: true;
  must_change_password: boolean;
  business: { id: string; name: string; slug: string };
};

const inputClass =
  "mt-1.5 w-full rounded-xl border border-white/10 bg-[#15171c] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400/70";

async function readAdminSession(): Promise<AdminSession | null> {
  const response = await fetch("/api/admin/session", { cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json()) as AdminSession;
}

async function requestJson(
  url: string,
  body: Record<string, string>
): Promise<{ error?: string }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || "Não foi possível concluir a operação.");
  }
  return data;
}

export default function BarberAdminPage() {
  const [stage, setStage] = useState<"loading" | "login" | "change" | "ready">(
    "loading"
  );
  const [session, setSession] = useState<AdminSession | null>(null);
  const [email, setEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    readAdminSession()
      .then((current) => {
        if (!active) return;
        if (!current) {
          setStage("login");
          return;
        }
        setSession(current);
        setStage(current.must_change_password ? "change" : "ready");
      })
      .catch(() => {
        if (active) {
          setError("Não foi possível verificar a sessão.");
          setStage("login");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await requestJson("/api/admin/login", { email: email.trim(), password: loginPassword });
      const current = await readAdminSession();
      if (!current) throw new Error("Não foi possível iniciar a sessão.");
      setSession(current);
      setStage(current.must_change_password ? "change" : "ready");
      setLoginPassword("");
    } catch (loginError) {
      setError(
        loginError instanceof Error ? loginError.message : "Não foi possível entrar."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!isStrongPassword(newPassword)) {
      setError(PASSWORD_REQUIREMENTS);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("As senhas informadas não correspondem.");
      return;
    }
    setSaving(true);
    try {
      await requestJson("/api/admin/password", { password: newPassword });
      const current = await readAdminSession();
      if (!current) throw new Error("A senha foi alterada, mas a sessão expirou.");
      setSession(current);
      setStage("ready");
      setNewPassword("");
      setConfirmPassword("");
    } catch (passwordError) {
      setError(
        passwordError instanceof Error
          ? passwordError.message
          : "Não foi possível alterar a senha."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/session", { method: "POST" });
    setSession(null);
    setStage("login");
    setEmail("");
  }

  const isChangeStage = stage === "change";

  if (stage === "ready" && session) {
    return (
      <BusinessAdminDashboard
        businessName={session.business.name}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0c0f] px-5 py-12 text-white">
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#111318] p-7 shadow-2xl sm:p-10">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400 text-lg font-black text-zinc-950">
          K
        </div>
        <p className="mt-6 text-center text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
          Área da barbearia
        </p>

        {stage === "loading" ? (
          <p className="mt-5 text-center text-sm text-zinc-400">
            Verificando acesso...
          </p>
        ) : (
          <>
            <h1 className="mt-2 text-center text-2xl font-semibold tracking-tight">
              {isChangeStage ? "Crie sua nova senha" : "Entrar no painel"}
            </h1>
            <p className="mt-3 text-center text-sm leading-6 text-zinc-400">
              {isChangeStage
                ? "Por segurança, substitua a senha temporária antes de continuar."
                : "Use as credenciais de administrador fornecidas pela plataforma."}
            </p>

            {isChangeStage ? (
              <form className="mt-7 space-y-4" onSubmit={handlePasswordChange}>
                <label className="block text-sm font-medium text-zinc-300">
                  Nova senha
                  <input
                    autoComplete="new-password"
                    className={inputClass}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                    type="password"
                    value={newPassword}
                  />
                </label>
                <p className="-mt-2 text-xs text-zinc-500">
                  {PASSWORD_REQUIREMENTS}
                </p>
                <label className="block text-sm font-medium text-zinc-300">
                  Confirmar nova senha
                  <input
                    autoComplete="new-password"
                    className={inputClass}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    type="password"
                    value={confirmPassword}
                  />
                </label>
                {error && (
                  <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-300">
                    {error}
                  </p>
                )}
                <button
                  className="w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? "Atualizando..." : "Salvar nova senha"}
                </button>
              </form>
            ) : (
              <form className="mt-7 space-y-4" onSubmit={handleLogin}>
                <label className="block text-sm font-medium text-zinc-300">
                  E-mail
                  <input
                    autoComplete="username"
                    className={inputClass}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    type="email"
                    value={email}
                  />
                </label>
                <label className="block text-sm font-medium text-zinc-300">
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
                {error && (
                  <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-300">
                    {error}
                  </p>
                )}
                <button
                  className="w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? "Validando..." : "Entrar"}
                </button>
              </form>
            )}
          </>
        )}
      </section>
    </main>
  );
}
