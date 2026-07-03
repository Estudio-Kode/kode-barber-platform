#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Assistente de configuracao das notificacoes por Telegram.

Pode ser rodado VARIAS vezes: cada execucao ADICIONA uma pessoa que recebera
os avisos (nao remove quem ja estava). Assim da pra avisar o barbeiro e voce.

Para cada pessoa que for receber:

  1. (so na 1a vez) No Telegram, fale com o @BotFather, envie /newbot e siga
     as instrucoes. Ele te da um TOKEN, parecido com 123456789:AAH9x...zZ

  2. A PESSOA que vai receber abre o bot e toca em "Iniciar" (ou manda "oi").
     ISSO E OBRIGATORIO: o Telegram nao deixa o bot mandar a 1a mensagem para
     quem nunca falou com ele. Sem esse passo, ela nao recebe nada.

  3. LOGO EM SEGUIDA rode este assistente (CONFIGURAR_TELEGRAM.bat). Cole o
     token. Ele captura a ULTIMA pessoa que falou com o bot, adiciona aos
     destinatarios e envia um teste para ela.

  4. Repita os passos 2-3 para cada pessoa. No fim, reinicie o site para
     aplicar as mudancas.
"""

import json
import os
import sys
import urllib.request
import urllib.parse

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")


def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
        f.write("\n")


def tg_get(token, method):
    url = "https://api.telegram.org/bot%s/%s" % (token, method)
    with urllib.request.urlopen(url, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def tg_send(token, chat_id, text):
    url = "https://api.telegram.org/bot%s/sendMessage" % token
    data = urllib.parse.urlencode({"chat_id": chat_id, "text": text}).encode("utf-8")
    with urllib.request.urlopen(urllib.request.Request(url, data=data), timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    print("=" * 56)
    print(" Configuracao das notificacoes por Telegram")
    print("=" * 56)

    cfg = load_config()
    tg = cfg.get("telegram")
    if not isinstance(tg, dict):
        tg = {"enabled": False, "bot_token": "", "chat_id": ""}
        cfg["telegram"] = tg

    token = (tg.get("bot_token") or "").strip()
    if not token:
        token = input("Cole o token do bot (do @BotFather): ").strip()
    if not token:
        print("Nenhum token informado. Encerrando.")
        return 1

    # Valida o token
    try:
        me = tg_get(token, "getMe")
    except Exception as exc:
        print("Nao consegui falar com o Telegram. Verifique sua internet.")
        print("Detalhe:", exc)
        return 1
    if not me.get("ok"):
        print("Token invalido. Confira se copiou certo do @BotFather.")
        return 1
    bot_name = me["result"].get("username", "?")
    print("Bot reconhecido: @%s" % bot_name)

    # Descobre o chat_id a partir das mensagens recebidas
    try:
        updates = tg_get(token, "getUpdates")
    except Exception as exc:
        print("Falha ao buscar mensagens:", exc)
        return 1

    chat_id = None
    for u in reversed(updates.get("result", [])):
        msg = u.get("message") or u.get("edited_message") or {}
        chat = msg.get("chat") or {}
        if chat.get("id") is not None:
            chat_id = chat["id"]
            break

    if chat_id is None:
        print()
        print("Ainda nao recebi nenhuma mensagem sua.")
        print("Abra o bot  @%s  no Telegram, envie um 'oi' e rode de novo." % bot_name)
        return 1

    # Monta a lista de destinatarios SEM remover quem ja estava cadastrado.
    recips = [str(c).strip() for c in (tg.get("chat_ids") or []) if str(c).strip()]
    legacy = str(tg.get("chat_id") or "").strip()   # formato antigo (um so)
    if legacy and legacy not in recips:
        recips.append(legacy)
    new_id = str(chat_id)
    already = new_id in recips
    if not already:
        recips.append(new_id)

    tg["bot_token"] = token
    tg["chat_ids"] = recips
    tg["chat_id"] = ""          # migrado para a lista chat_ids
    tg["enabled"] = True
    save_config(cfg)

    # Envia o teste apenas para o destinatario recem-adicionado.
    try:
        tg_send(token, new_id,
                "✅ Notificacoes configuradas! "
                "Voce recebera aqui as marcacoes e desmarcacoes da Ziah Cortes.")
    except Exception as exc:
        print("Salvei a configuracao, mas falhei ao enviar o teste:", exc)
        print("Confira se ESTE Telegram tocou em 'Iniciar' no bot @%s." % bot_name)
        return 1

    print()
    if already:
        print("Este Telegram (chat_id %s) JA estava cadastrado." % new_id)
    else:
        print("Adicionado! Novo destinatario: chat_id %s" % new_id)
    print("Enviei uma mensagem de teste para ele.")
    print("Total de pessoas que receberao avisos agora: %d" % len(recips))
    print()
    print("Para adicionar outra pessoa, peca para ela tocar em 'Iniciar' no bot")
    print("@%s e rode este assistente de novo logo em seguida." % bot_name)
    print("Por fim, reinicie o site para aplicar as mudancas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
