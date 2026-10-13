# 🔒 Segurança — leia antes de colocar em produção

Este arquivo lista as ações de segurança necessárias. As duas primeiras são
**obrigatórias** porque um segredo já foi exposto publicamente.

---

## 1. ⚠️ Rotacionar o token do Telegram (OBRIGATÓRIO)

O token do bot do Telegram foi commitado no histórico do Git e enviado ao
GitHub. **Considere esse token como comprometido** — qualquer pessoa que tenha
visto o repositório pode usá-lo. Limpar o histórico (passo 2) **não** desfaz
isso; o token antigo precisa ser revogado.

Como rotacionar:

1. No Telegram, abra o **@BotFather**.
2. Envie `/revoke`, escolha o bot da Ziah Cortes e confirme. O token antigo
   deixa de funcionar na hora.
3. O BotFather te dá um **token novo**.
4. Coloque o token novo em `config.json` (campo `telegram.bot_token`) — esse
   arquivo é ignorado pelo Git e nunca é enviado ao GitHub.
   Em produção, prefira a variável de ambiente `BARBER_TELEGRAM_TOKEN`.

---

## 2. 🧹 Limpar o histórico do Git (remover o `config.json` antigo)

O `config.json` (com token, hash de senha e WhatsApp) existe nos commits
`6fbadf3` e `c7ab274`. Rode os comandos abaixo **no seu computador** (Git Bash
ou PowerShell com git), a partir da pasta do projeto. Eles reescrevem o
histórico e sobrescrevem o GitHub.

> Antes de começar: avise qualquer outra pessoa que use o repositório — após o
> `push --force` elas precisarão clonar de novo. Se o git reclamar de
> `index.lock`, apague o arquivo `.git/index.lock` e tente de novo.

```bash
# 1. (recomendado) Faça um backup da pasta inteira antes de reescrever o histórico.

# 2. Purga o config.json de TODOS os commits:
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch config.json" \
  --prune-empty --tag-name-filter cat -- --all

# 3. Remove as referências de backup que o filter-branch cria:
git for-each-ref --format="delete %(refname)" refs/original | git update-ref --stdin
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 4. Confirma que o token sumiu (não deve retornar nenhum commit):
git log --oneline -S "8933516020" --all

# 5. Sobrescreve o GitHub:
git push origin --force --all
git push origin --force --tags
```

> Alternativa mais moderna: se tiver o `git filter-repo` instalado, use
> `git filter-repo --path config.json --invert-paths` no lugar do passo 2.

---

## 3. Trocar a senha do admin

A senha atual do painel está guardada como hash SHA-256 no `config.json`. Para
trocar, gere um novo hash e substitua o campo `admin.password_sha256`:

```bash
python -c "import hashlib,getpass;print(hashlib.sha256(getpass.getpass('Nova senha: ').encode()).hexdigest())"
```

Em produção, prefira definir a variável de ambiente `BARBER_ADMIN_PASSWORD`
(tem prioridade sobre o `config.json`), assim a senha nem fica em arquivo.

---

## 4. Regras já garantidas pelo `.gitignore`

Estes arquivos **nunca** vão para o Git (contêm segredos ou dados de clientes):

- `config.json` — token, senha, WhatsApp
- `appointments.db` (e `-wal` / `-shm`) — nomes e telefones reais de clientes
- `.env` — variáveis de ambiente locais
- `.claude/`, `__pycache__/` — artefatos de ferramentas

Para configurar do zero, copie `config.example.json` para `config.json` e
preencha os valores.

---

## 5. Consulta e cancelamento de clientes

Consulta e cancelamento online estão desativados. Antes, o sistema aceitava o
telefone como única prova de identidade; qualquer pessoa que soubesse o número
poderia consultar ou cancelar horários. Até a integração de uma confirmação
por SMS ou WhatsApp, o cliente deve tratar esses pedidos diretamente com o
barbeiro. Não reative essas rotas sem validar um código temporário no servidor.

## 6. Painel atrás do proxy

O Caddy repassa o endereço real do visitante em `X-Real-IP`, e o servidor só
aceita esse cabeçalho quando a conexão veio do próprio computador (localhost).
Assim, o limite de tentativas do login distingue visitantes mesmo atrás do
proxy. Mantenha o servidor Python escutando em `127.0.0.1`, como no serviço
systemd incluído.

Os logs do servidor guardam o caminho da rota sem parâmetros de URL, para não
registrar telefones enviados em consultas antigas ou em outras rotas.
