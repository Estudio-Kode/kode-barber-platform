import { formatDateLabel, formatPhoneBr } from "@/lib/domain";

function getTelegramConfig() {
  const enabledRaw = (process.env.BARBER_TELEGRAM_ENABLED || "false")
    .trim()
    .toLowerCase();
  const enabled = enabledRaw === "true" || enabledRaw === "1";
  const token = (process.env.BARBER_TELEGRAM_TOKEN || "").trim();
  const rawIds = [
    process.env.BARBER_TELEGRAM_CHAT_ID || "",
    ...(process.env.BARBER_TELEGRAM_CHAT_IDS || "").split(","),
  ];

  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const id of rawIds) {
    const clean = id.trim();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      recipients.push(clean);
    }
  }

  return { enabled, token, recipients };
}

export function sendTelegramNotification(text: string): void {
  const { enabled, token, recipients } = getTelegramConfig();
  if (!enabled || !token || recipients.length === 0) return;

  // Dispara em background (best-effort): nunca atrasa ou falha a marcação
  void (async () => {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    for (const chatId of recipients) {
      try {
        const body = new URLSearchParams({
          chat_id: chatId,
          text,
          disable_web_page_preview: "true",
        });
        await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: body.toString(),
          signal: AbortSignal.timeout(10000),
        });
      } catch (err) {
        console.error(`[telegram] falha ao notificar ${chatId}:`, err);
      }
    }
  })();
}

export function notifyNewBooking(params: {
  name: string;
  phone: string;
  service: string;
  date: string;
  time: string;
}): void {
  const msg = [
    "🟢 Nova marcação",
    `👤 ${params.name}`,
    `📞 ${formatPhoneBr(params.phone)}`,
    `✂️ ${params.service}`,
    `📅 ${formatDateLabel(params.date)} às ${params.time}`,
  ].join("\n");
  sendTelegramNotification(msg);
}

export function notifyCancelledBooking(params: {
  name: string;
  phone: string;
  service: string;
  date: string;
  time: string;
  byAdmin: boolean;
}): void {
  const origem = params.byAdmin ? "pelo painel" : "pelo cliente";
  const msg = [
    `🔴 Marcação desmarcada (${origem})`,
    `👤 ${params.name || "—"}`,
    `📞 ${formatPhoneBr(params.phone)}`,
    `✂️ ${params.service}`,
    `📅 ${formatDateLabel(params.date)} às ${params.time}`,
  ].join("\n");
  sendTelegramNotification(msg);
}

