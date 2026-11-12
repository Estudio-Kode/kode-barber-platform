import Link from "next/link";

const capabilities = [
  {
    number: "01",
    title: "Agenda organizada",
    description:
      "Horários, equipe e serviços preparados para acompanhar a rotina de cada barbearia.",
  },
  {
    number: "02",
    title: "Cada negócio, seu espaço",
    description:
      "Uma experiência própria para cada empresa, com seus dados e configurações.",
  },
  {
    number: "03",
    title: "Ferramentas que acompanham você",
    description:
      "Recursos e limites configurados conforme o plano contratado.",
  },
];

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0b0c0f] text-white">
      <div className="pointer-events-none absolute -left-40 -top-56 h-[36rem] w-[36rem] rounded-full bg-amber-400/[0.08] blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-64 -right-36 h-[38rem] w-[38rem] rounded-full bg-indigo-400/[0.07] blur-[150px]" />

      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link aria-label="Kode Barber, início" className="flex items-center gap-3" href="/">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 font-black text-zinc-950">
            K
          </div>
          <span className="text-sm font-bold tracking-[0.16em]">KODE BARBER</span>
        </Link>
        <Link
          className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-amber-300/40 hover:text-white"
          href="/platform"
        >
          Acesso da plataforma
        </Link>
      </header>

      <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-amber-300/15 bg-amber-300/[0.06] px-3 py-1.5 text-xs font-medium text-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
            Tecnologia para barbearias
          </p>
          <h1 className="mt-7 max-w-2xl text-5xl font-semibold leading-[1.06] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
            Sua barbearia,
            <span className="block text-amber-300">no seu ritmo.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-zinc-400 sm:text-lg sm:leading-8">
            Agendamento e ferramentas de gestão pensados para simplificar o
            dia a dia de quem vive da barbearia.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
              href="/platform"
            >
              Entrar na central Kode
              <span aria-hidden="true" className="ml-2">
                →
              </span>
            </Link>
            <a
              className="rounded-xl border border-white/10 px-5 py-3 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
              href="#recursos"
            >
              Conhecer a plataforma
            </a>
          </div>
          <p className="mt-5 text-xs leading-5 text-zinc-600">
            O agendamento público de cada barbearia estará disponível no seu
            endereço personalizado após a configuração.
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-lg">
          <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-amber-300/10 via-transparent to-indigo-300/10 blur-2xl" />
          <div className="relative rounded-[1.6rem] border border-white/10 bg-[#111318]/90 p-5 shadow-2xl backdrop-blur-xl sm:p-7">
            <div className="flex items-center justify-between border-b border-white/7 pb-5">
              <div>
                <p className="text-xs text-zinc-500">Visão geral</p>
                <p className="mt-1 text-lg font-semibold">Sua operação, clara.</p>
              </div>
              <span className="rounded-lg border border-amber-300/15 bg-amber-300/[0.07] px-2.5 py-1.5 text-[10px] font-medium text-amber-200">
                PAINEL
              </span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/7 bg-white/[0.025] p-4">
                <p className="text-xs text-zinc-500">Agenda</p>
                <div className="mt-4 flex items-end gap-1.5">
                  {[34, 52, 40, 70, 48, 86, 58, 76, 44, 64, 38, 72].map(
                    (height, index) => (
                      <span
                        className={`flex-1 rounded-t-sm ${
                          index === 5 || index === 9
                            ? "bg-amber-300"
                            : "bg-zinc-700"
                        }`}
                        key={`${height}-${index}`}
                        style={{ height: `${height}px` }}
                      />
                    )
                  )}
                </div>
                <div className="mt-2 flex justify-between text-[9px] text-zinc-600">
                  <span>08h</span>
                  <span>12h</span>
                  <span>16h</span>
                  <span>20h</span>
                </div>
              </div>
              <div className="rounded-xl border border-white/7 bg-white/[0.025] p-4">
                <p className="text-xs text-zinc-500">Seu espaço</p>
                <div className="mt-4 flex h-[106px] flex-col justify-end gap-2">
                  <div className="h-2 w-full rounded-full bg-white/5">
                    <div className="h-2 w-3/4 rounded-full bg-amber-300/80" />
                  </div>
                  <div className="h-2 w-4/5 rounded-full bg-white/5">
                    <div className="h-2 w-1/2 rounded-full bg-indigo-300/80" />
                  </div>
                  <div className="h-2 w-2/3 rounded-full bg-white/5">
                    <div className="h-2 w-3/5 rounded-full bg-emerald-300/80" />
                  </div>
                  <p className="pt-1 text-[10px] text-zinc-600">
                    Equipe, serviços e horários
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/7 bg-white/[0.025] p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-300/10 text-sm text-emerald-200">
                ✓
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-200">
                  Feito para a rotina real
                </p>
                <p className="mt-1 text-[10px] text-zinc-600">
                  Simples de administrar, fácil de usar.
                </p>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-5 -left-4 rounded-xl border border-white/10 bg-[#17191e] px-4 py-3 shadow-xl sm:-left-8">
            <p className="text-[10px] text-zinc-500">Uma plataforma</p>
            <p className="mt-1 text-sm font-semibold text-white">
              Para cada barbearia
            </p>
          </div>
        </div>
      </section>

      <section
        className="relative z-10 border-t border-white/6 bg-white/[0.015]"
        id="recursos"
      >
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
            Uma base para crescer
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {capabilities.map((capability) => (
              <article
                className="rounded-2xl border border-white/7 bg-[#101216] p-5 sm:p-6"
                key={capability.number}
              >
                <p className="text-xs tracking-widest text-zinc-600">
                  {capability.number}
                </p>
                <h2 className="mt-5 text-base font-semibold text-white">
                  {capability.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  {capability.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/6 px-5 py-6 text-center text-xs text-zinc-600">
        Kode Barber · Agendamento e gestão para barbearias
      </footer>
    </main>
  );
}
