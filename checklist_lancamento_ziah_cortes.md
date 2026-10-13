# Ziah Cortes — Checklist para colocar no ar

Ordem recomendada: **segurança primeiro**, depois deploy, depois QA, depois avisar o cliente.

---

## 1. Segurança (obrigatório antes de divulgar)

O README do projeto já sinaliza isso: o token do bot do Telegram foi commitado
nos commits `6fbadf3` e `c7ab274` e enviado ao GitHub. Confirmei — esses commits
ainda estão no histórico do repositório. Considere esse token comprometido.

- [ ] **Revogar o token antigo do Telegram**: no @BotFather, envie `/revoke`,
  escolha o bot da Ziah Cortes e confirme. Gere um token novo.
- [ ] **Colocar o token novo** em produção via variável de ambiente
  `BARBER_TELEGRAM_TOKEN` (não no `config.json`, para não repetir o problema).
- [ ] **Limpar o histórico do Git** para remover o `config.json` antigo dos
  commits (os comandos exatos estão em `SEGURANCA.md`, seção 2 — usa
  `git filter-branch` ou `git filter-repo` + `push --force`). Isso precisa
  rodar na sua máquina, não é algo que eu consigo fazer por vocês (não tenho
  credenciais do GitHub configuradas aqui).
- [ ] **Trocar a senha do admin**: gerar novo hash SHA-256 ou (melhor) definir
  via variável de ambiente `BARBER_ADMIN_PASSWORD` no servidor.
- [ ] **Consulta/cancelamento de cliente:** estão desativados no site até haver
  confirmação de identidade por SMS/WhatsApp. Até a integração, o barbeiro
  consulta e cancela manualmente pelo painel; os clientes pedem pelo WhatsApp.
- [ ] Confirmar que `config.json`, `appointments.db` e `.env` continuam fora
  do Git (já estão no `.gitignore`, só checar que ninguém commitou por engano).

> Isso não é opcional nem cosmético: o token exposto pode ser usado por
> qualquer pessoa que tenha visto o repositório para mandar mensagens pelo bot
> da Ziah Cortes. Façam antes de divulgar o link pro cliente final.

---

## 2. Deploy (servidor)

Vocês ainda não têm VPS para esse projeto. Resumo do `deploy/DEPLOY.md`:

- [ ] **Escolher provedor**: para uma barbearia, o guia recomenda
  **Hostinger VPS (KVM 1)** — ~R$28/mês, datacenter em São Paulo, suporte em
  português, mais fácil para quem está começando. Alternativas: Vultr (~US$5-6,
  tem região SP) ou Contabo (mais barato, fora do Brasil, latência maior).
- [ ] Criar o VPS com **Ubuntu 24.04 LTS**, região São Paulo, anotar o IP.
- [ ] Acessar via SSH (`ssh root@SEU-IP`).
- [ ] Rodar a instalação automática:
  ```bash
  apt-get update && apt-get install -y git
  git clone https://github.com/Estudio-Kode/kode-ziahcortes-sisagendamento.git ziah
  cd ziah
  sudo bash deploy/setup_servidor.sh SEU-IP
  ```
  Isso instala Python, Caddy (HTTPS automático), cria o serviço systemd e
  libera o firewall. Site fica em `https://SEU-IP.sslip.io` (funciona sem
  domínio próprio).
- [ ] **Ajustes finais obrigatórios**:
  - Segredos em `/etc/ziah/ziah.env` (senha admin nova + token novo do Telegram)
  - Dados reais do negócio em `/opt/ziah/config.json` (WhatsApp, serviços,
    preços, horários de funcionamento da Ziah Cortes)
  - `sudo systemctl restart ziah`
- [ ] Testar em `https://SEU-IP.sslip.io/` (cliente) e `/admin` (painel).
- [ ] Ativar o backup diário automático (o script de setup já configura;
  se foi instalação manual, ver seção 8 do `DEPLOY.md`).
- [ ] Domínio próprio (`ziahcortes.com.br` ou similar) é opcional agora —
  dá pra trocar depois sem downtime, apontando um registro A pro IP.

---

## 3. QA antes de mostrar ao cliente

Direto do `03_processo_de_entrega.md`, aplicado a este projeto:

- [ ] Funciona em celular e desktop
- [ ] Fluxo completo testado como cliente real: marcar horário, receber
  confirmação; solicitar consulta/cancelamento pelo WhatsApp
- [ ] Testar dois agendamentos no mesmo horário (deve bloquear)
- [ ] Confirmar que o site não revela consulta/cancelamento por telefone e que
  o botão direciona o cliente ao WhatsApp
- [ ] Testar tentativa de marcar fora do horário de funcionamento
- [ ] Painel `/admin` funcionando (login, ver agenda, gerenciar)
- [ ] Notificação do Telegram chegando (com o token novo)
- [ ] Nenhuma credencial visível no código-fonte servido ao navegador
- [ ] Backup testado (rodar `backup_db.sh` manualmente e conferir o arquivo)

---

## 4. Valor a combinar com o cliente

Vocês definiram que, por ser o primeiro projeto do estúdio, **não vai cobrar
o valor do projeto — só a manutenção mensal**. Isso está alinhado com a regra
do catálogo ("primeiros 1-2 projetos podem ser baratos/de graça para gerar
portfólio e depoimento").

Pela tabela (Oferta 2 — Sistema de agendamento), a manutenção mensal de
referência é **R$150 a R$400/mês** (faixa considerada "essencial", porque o
sistema tem banco de dados e precisa de manutenção contínua real: backups,
correções, disponibilidade).

Ponto de atenção, não é só formalidade: a VPS recomendada já custa uns
R$28/mês. Cobrar bem abaixo disso deixa a manutenção no prejuízo assim que
somam hospedagem + tempo de suporte. Uma faixa razoável para um primeiro
projeto/portfólio, sem exagerar mas também sem operar no vermelho, fica em
torno de **R$150 a R$200/mês**. A decisão final do número é de vocês — essa é
só uma referência com base no catálogo e no custo real de manter no ar.

---

## 5. Rascunho de mensagem para a Ziah Cortes

> Oi! O sistema de agendamento da Ziah Cortes está pronto e testado. Nos
> próximos dias vamos colocar no ar (link vai funcionar em qualquer
> celular ou computador, sem precisar instalar nada).
>
> Combinado: por ser nosso primeiro projeto, não vamos cobrar o valor do
> desenvolvimento — só a manutenção mensal, que cobre hospedagem, backup
> diário dos dados e pequenos ajustes/suporte. Fica em R$[definir] por mês.
>
> Assim que o link estiver no ar, te mando o acesso do painel (onde você vê e
> gerencia os agendamentos) e explico rapidinho como usar.

Ajustem o valor e o tom antes de enviar — é só um ponto de partida.
