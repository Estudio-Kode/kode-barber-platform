# Kode Barber Platform — Agendamento para barbearias

Plataforma em evolução para agendamento e operação de barbearias, desenvolvida pela **Kode** com **Next.js (App Router) + TypeScript + Tailwind CSS + Supabase (PostgreSQL)**. O tenant inicial é a **Ziah Cortes**.

---

## Estrutura do Projeto

```
PROJETO_ZIAH/
├── src/
│   ├── app/
│   │   ├── page.tsx                        # Interface de agendamento do cliente (Mobile + Desktop)
│   │   ├── admin/page.tsx                  # Painel administrativo do barbeiro (/admin)
│   │   ├── platform/page.tsx               # Central Kode para administrar barbearias e planos (/platform)
│   │   ├── layout.tsx                      # Layout raiz + suporte a tema claro/escuro
│   │   ├── globals.css                     # Design tokens (Modern Barber Dark/Gold & Light)
│   │   └── api/                            # Rotas Server-Only protegidas
│   │       ├── config/route.ts             # Configuração pública da barbearia
│   │       ├── days/route.ts               # Dias abertos selecionáveis
│   │       ├── availability/route.ts       # Horários disponíveis em tempo real
│   │       ├── appointments/               # Agendamentos públicos e cancelamento desativado
│   │       ├── my-appointments/            # Consulta pública desativada
│   │       ├── admin/                      # Rotas autenticadas do barbeiro
│   │       └── platform/                   # Login, barbearias e planos da plataforma
│   │           ├── login/route.ts
│   │           ├── session/route.ts
│   │           ├── businesses/route.ts
│   │           ├── businesses/[id]/route.ts
│   │           └── plans/route.ts
│   ├── components/
│   │   ├── BrandLogo.tsx                   # Logo vetorial Ziah Cortes
│   │   ├── ThemeToggle.tsx                 # Alternador de tema Claro / Escuro
│   │   └── KodeFooter.tsx                  # Assinatura "created by kode"
│   ├── config/
│   │   └── business.ts                     # Serviços, preços, horários e regras de negócio
│   └── lib/
│       ├── auth.ts                         # Sessão HMAC-SHA256 + timing-safe + rate-limit
│       ├── domain.ts                       # Regras de fuso (America/Sao_Paulo), cutoff e datas
│       ├── request-guard.ts                # Proteção anti-DoS (limite 16 KB) e anti-spam
│       ├── supabase-server.ts              # Cliente REST Server-Only para o Supabase
│       └── telegram.ts                     # Disparo assíncrono de notificações no Telegram
├── .env.example                            # Modelo das variáveis de ambiente
├── .env.local                              # Segredos locais (ignorado pelo Git)
├── supabase/migrations/                    # Esquema multiempresa e dados iniciais
├── security-test.mjs                       # Bateria automatizada de auditoria de segurança
├── test-suite.mjs                          # Bateria automatizada de testes de integração
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
   - **Cliente:** [http://localhost:3000](http://localhost:3000)
   - **Painel do Barbeiro:** [http://localhost:3000/admin](http://localhost:3000/admin)
   - **Central da Plataforma:** [http://localhost:3000/platform](http://localhost:3000/platform)

## Primeira configuração multiempresa

1. Aplique `supabase/migrations/202611120001_platform_foundation.sql` em um projeto Supabase vazio.
   A migração cria os planos, barbearias, serviços, equipe, horários, clientes, agendamentos,
   catálogo e assinaturas de clientes. A barbearia existente é cadastrada como `ziah-cortes`.
2. Configure `PLATFORM_ADMIN_USER`, `PLATFORM_ADMIN_PASSWORD` e um
   `PLATFORM_SESSION_SECRET` aleatório com pelo menos 32 caracteres no `.env.local`.
   Use credenciais diferentes das do painel do barbeiro.
3. Acesse `/platform` para cadastrar barbearias, configurar os planos e provisionar o acesso.

Esta primeira etapa oferece o painel central e o esquema isolado por `business_id`.
O agendamento atual continua ligado ao tenant `ziah-cortes`; páginas públicas por slug
(`/b/<slug>`) e os módulos operacionais por tenant serão conectados em fases seguintes.
O banco anterior foi excluído, portanto a migração cria a estrutura do zero e não recupera dados.

---

## Testes Automatizados

- **Auditoria de Segurança (9 verificações):**
  ```bash
  node --env-file=.env.local security-test.mjs
  ```

- **Testes de Integração Ponta a Ponta (12 cenários com Supabase):**
  ```bash
  npm run build
  node --env-file=.env.local test-suite.mjs
  ```

---

## Publicar em Produção (Vercel)

1. Suba o repositório para o GitHub (após limpar o histórico antigo conforme `SEGURANCA.md`).
2. Na [Vercel](https://vercel.com), clique em **Add New Project** e importe o repositório.
3. Em **Environment Variables**, adicione as variáveis do `.env.local`:
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
   - `BARBER_ADMIN_USER`
   - `BARBER_ADMIN_PASSWORD`
   - `BARBER_SESSION_SECRET`
   - `BARBER_TELEGRAM_ENABLED`
   - `BARBER_TELEGRAM_TOKEN`
   - `BARBER_TELEGRAM_CHAT_IDS`
4. Clique em **Deploy**. O site entrará no ar automaticamente com HTTPS.
