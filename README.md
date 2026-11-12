# Kode Barber Platform — Agendamento para barbearias

Plataforma em evolução para agendamento e operação de barbearias, desenvolvida pela **Kode** com **Next.js (App Router) + TypeScript + Tailwind CSS + Supabase (PostgreSQL)**.

---

## Estrutura do Projeto

```
KODE_BARBER/
├── src/
│   ├── app/
│   │   ├── page.tsx                        # Página inicial da plataforma
│   │   ├── admin/page.tsx                  # Login do responsável e troca inicial de senha
│   │   ├── platform/page.tsx               # Central Kode para administrar barbearias e planos (/platform)
│   │   ├── layout.tsx                      # Layout raiz + suporte a tema claro/escuro
│   │   ├── globals.css                     # Design tokens (Modern Barber Dark/Gold & Light)
│   │   └── api/                            # Rotas Server-Only protegidas
│   │       ├── config/route.ts             # Configuração pública da barbearia
│   │       ├── days/route.ts               # Dias abertos selecionáveis
│   │       ├── availability/route.ts       # Horários disponíveis em tempo real
│   │       ├── appointments/               # Agendamentos públicos e cancelamento desativado
│   │       ├── my-appointments/            # Consulta pública desativada
│   │       ├── admin/                      # Login e rotas autenticadas por barbearia
│   │       └── platform/                   # Login, barbearias, acessos e planos
│   │           ├── login/route.ts
│   │           ├── session/route.ts
│   │           ├── businesses/route.ts
│   │           ├── businesses/[id]/route.ts
│   │           ├── businesses/[id]/admin/route.ts
│   │           └── plans/route.ts
│   ├── components/
│   │   ├── BrandLogo.tsx                   # Identidade visual Kode Barber
│   │   ├── ThemeToggle.tsx                 # Alternador de tema Claro / Escuro
│   │   └── KodeFooter.tsx                  # Assinatura "created by kode"
│   ├── config/
│   │   └── business.ts                     # Serviços, preços, horários e regras de negócio
│   └── lib/
│       ├── auth.ts                         # Sessões HMAC-SHA256 separadas e rate-limit
│       ├── password-policy.ts              # Requisitos de senha dos administradores
│       ├── domain.ts                       # Regras de fuso (America/Sao_Paulo), cutoff e datas
│       ├── request-guard.ts                # Proteção anti-DoS (limite 16 KB) e anti-spam
│       ├── supabase-server.ts              # Cliente REST Server-Only para o Supabase
│       └── telegram.ts                     # Disparo assíncrono de notificações no Telegram
├── .env.example                            # Modelo das variáveis de ambiente
├── .env.local                              # Segredos locais (ignorado pelo Git)
├── supabase/migrations/                    # Esquema multiempresa e ajustes de dados
└── package.json
```

---

## Como rodar localmente

1. Instale as dependências (se ainda não instalou):
   ```bash
   npm install
   ```

2. Certifique-se de que o arquivo `.env.local` está preenchido (use `.env.example` como base).

3. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

4. Acesse no navegador:
   - **Página inicial:** [http://localhost:3000](http://localhost:3000)
   - **Central da Plataforma:** [http://localhost:3000/platform](http://localhost:3000/platform)

## Configuração multiempresa

1. Em um Supabase novo, aplique as migrações em ordem: primeiro
   `supabase/migrations/202611120001_platform_foundation.sql`,
   `supabase/migrations/202611120002_remove_ziah_business.sql` e
   `supabase/migrations/202611120003_business_admin_access.sql`.
   A primeira cria as tabelas e um plano inicial sem barbearias de demonstração; a segunda
   também remove a barbearia de demonstração de ambientes em que a primeira migração já havia sido aplicada.
   A exclusão da empresa remove em cascata os dados vinculados a ela.
2. Se as migrações 001 e 002 já foram aplicadas, execute
   `supabase/migrations/202611120003_business_admin_access.sql` no SQL Editor do Supabase
   para habilitar o acesso dos administradores. A migração 002 só precisa ser executada
   se ainda não tiver sido aplicada.
3. Configure `PLATFORM_ADMIN_USER`, `PLATFORM_ADMIN_PASSWORD` e os segredos
   `PLATFORM_SESSION_SECRET` e `BARBER_SESSION_SECRET`, cada um aleatório e com pelo menos
   32 caracteres, no `.env.local`.
4. Acesse `/platform` para cadastrar barbearias e configurar os planos.
5. Na lista de barbearias, escolha **Configurar acesso**. Defina o nome, e-mail e senha
   temporária do responsável; entregue a senha diretamente, pois ela não é enviada por
   e-mail. No primeiro acesso em `/admin`, o responsável deverá criar uma nova senha.

Esta etapa oferece a central da plataforma, login individual, troca obrigatória da senha
inicial e separação por `business_id` nas rotas administrativas. O agendamento público
por barbearia e os módulos operacionais ainda serão conectados em fases seguintes.

---

## Validação local

```bash
npm run lint
npm run build
```

---

## Publicar em Produção (Vercel)

1. Suba o repositório para o GitHub (após limpar o histórico antigo conforme `SEGURANCA.md`).
2. Na [Vercel](https://vercel.com), clique em **Add New Project** e importe o repositório.
3. Em **Environment Variables**, adicione as variáveis do `.env.local`:
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
   - `BARBER_SESSION_SECRET`
   - `PLATFORM_ADMIN_USER`
   - `PLATFORM_ADMIN_PASSWORD`
   - `PLATFORM_SESSION_SECRET`
   - `BARBER_TELEGRAM_ENABLED`
   - `BARBER_TELEGRAM_TOKEN`
   - `BARBER_TELEGRAM_CHAT_IDS`
4. Clique em **Deploy**. O site entrará no ar automaticamente com HTTPS.
