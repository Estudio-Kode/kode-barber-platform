import Link from "next/link";

export default function BarberAdminPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0c0f] px-5 py-12 text-white">
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#111318] p-7 text-center shadow-2xl sm:p-10">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400 text-lg font-black text-zinc-950">
          K
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
          Área da barbearia
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Acesso da equipe em preparação
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          O painel individual será habilitado após a configuração da empresa e
          do acesso de seus responsáveis.
        </p>
        <Link
          className="mt-7 inline-flex rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
          href="/platform"
        >
          Acessar a central da plataforma
        </Link>
      </section>
    </main>
  );
}
