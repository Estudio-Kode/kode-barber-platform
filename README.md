# Ziah Cortes — Sistema de Agendamento (Next.js + TypeScript + Supabase)

Sistema de agendamento online para a barbearia **Ziah Cortes**, desenvolvido pela **Kode** em **Next.js (App Router) + TypeScript + Tailwind CSS + Supabase (PostgreSQL)**.

---

## Estrutura do Projeto

```
PROJETO_ZIAH/
├── src/
│   ├── app/
│   │   ├── page.tsx                        # Interface de agendamento do cliente (Mobile + Desktop)
│   │   ├── admin/page.tsx                  # Painel administrativo do barbeiro (/admin)
│   │   ├── layout.tsx                      # Layout raiz + suporte a tema claro/escuro
│   │   ├── globals.css                     # Design tokens (Modern Barber Dark/Gold & Light)
│   │   └── api/                            # Rotas Server-Only protegidas
│   │       ├── config/route.ts             # Configuração pública da barbearia
│   │       ├── days/route.ts               # Dias abertos selecionáveis
│   │       ├── availability/route.ts       # Horários disponíveis em tempo real
│   │       ├── appointments/route.ts       # Criação de marcação com trava de concorrência
│   │       ├── appointments/[id]/route.ts  # 410 Gone (cancelamento direto desativado)
│   │       ├── my-appointments/route.ts    # 410 Gone (consulta por telefone desativada)
│   │       └── admin/                      # Rotas autenticadas do barbeiro
│   │           ├── login/route.ts          # Login com rate-limit por IP + cookie HttpOnly
│   │           ├── session/route.ts        # Verificação e encerramento de sessão
│   │           ├── slots/route.ts          # Grade do dia (marcado/bloqueado/livre + receita)
│   │           ├── appointments/route.ts   # Listagem de marcações
│   │           ├── appointments/[id]/route.ts # Desmarcar cliente + aviso no Telegram
│   │           ├── blocks/route.ts         # Bloquear / liberar horários
│   │           └── notes/route.ts          # Observações do dia com auto-save
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
