"use strict";

const state = {
  token: null,
  config: null,
  selectedDate: null,
  pollTimer: null,
  pendingAction: null,
  notesDate: null,        // dia atualmente exibido no campo de observacoes
  notesSaveTimer: null,   // debounce do salvamento automatico
};

function $(id) { return document.getElementById(id); }

function show(id) {
  ["screen-login", "screen-panel"].forEach((s) => $(s).classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function toast(message, type) {
  const wrap = $("toastWrap");
  const el = document.createElement("div");
  el.className = "toast " + (type || "info");
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function confirmModal(title, text, onConfirm) {
  $("modalTitle").textContent = title;
  $("modalText").textContent = text;
  state.pendingAction = onConfirm;
  $("modal").classList.remove("hidden");
}
function closeModal() { $("modal").classList.add("hidden"); state.pendingAction = null; }

async function api(path, opts) {
  opts = opts || {};
  opts.headers = opts.headers || {};
  if (state.token) opts.headers["Authorization"] = "Bearer " + state.token;
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch (e) {}
  return { ok: res.ok, status: res.status, data };
}

// ---------------------------------------------------------------------------
async function init() {
  // Listeners e tela primeiro: o login funciona mesmo se algo abaixo falhar,
  // garantindo que a pagina nunca fique em branco.
  $("loginForm").addEventListener("submit", onLogin);
  $("logoutBtn").addEventListener("click", logout);
  $("modalCancel").addEventListener("click", closeModal);
  $("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  $("modalConfirm").addEventListener("click", () => {
    const fn = state.pendingAction;
    closeModal();
    if (fn) fn();
  });

  // Observacoes do dia: salva automaticamente (debounce), ao sair do campo e no botao.
  $("saveNotesBtn").addEventListener("click", saveNotes);
  $("dayNotes").addEventListener("input", scheduleSaveNotes);
  $("dayNotes").addEventListener("blur", () => { if (state.notesSaveTimer) saveNotes(); });

  state.token = sessionStorage.getItem("barber_admin_token");
  if (state.token) {
    enterPanel();
  } else {
    show("screen-login");
  }

  // /api/config nao e essencial para o login; se falhar, ignora.
  try {
    const r = await fetch("/api/config");
    state.config = await r.json();
    if (state.config.business_name) document.title = "Admin - " + state.config.business_name;
  } catch (e) { /* ignore */ }
}

async function onLogin(e) {
  e.preventDefault();
  $("loginError").textContent = "";
  const username = $("username").value.trim();
  const password = $("password").value;
  const { ok, data } = await api("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (ok) {
    state.token = data.token;
    sessionStorage.setItem("barber_admin_token", state.token);
    enterPanel();
  } else {
    $("loginError").textContent = data.error || "Falha no login.";
  }
}

function logout() {
  sessionStorage.removeItem("barber_admin_token");
  state.token = null;
  stopPolling();
  $("logoutBtn").classList.add("hidden");
  $("password").value = "";
  show("screen-login");
}

async function enterPanel() {
  $("logoutBtn").classList.remove("hidden");
  show("screen-panel");
  await loadDays();
}

async function loadDays() {
  const { ok, data } = await api("/api/days");
  if (!ok) return;
  const wrap = $("adminDays");
  wrap.innerHTML = "";
  let todayDate = null;
  data.days.forEach((d) => {
    const chip = document.createElement("div");
    chip.className = "day-chip" + (d.is_today ? " today" : "");
    chip.dataset.date = d.date;
    chip.innerHTML =
      `<div class="wd">${d.weekday}</div>` +
      `<div class="dn">${d.day}</div>` +
      `<div class="mo">${d.month}</div>`;
    chip.addEventListener("click", () => selectDay(d, chip));
    wrap.appendChild(chip);
    if (d.is_today) todayDate = { d, chip };
  });
  // Seleciona o dia atual por padrao (destacado)
  if (todayDate) {
    selectDay(todayDate.d, todayDate.chip);
  } else if (data.days.length) {
    const first = wrap.firstChild;
    selectDay(data.days[0], first);
  }
}

function selectDay(d, chip) {
  document.querySelectorAll(".day-chip").forEach((c) => c.classList.remove("selected"));
  chip.classList.add("selected");
  // Antes de trocar de dia, garante que edicoes pendentes do dia anterior
  // sejam salvas (o conteudo e a data ainda sao os antigos neste ponto).
  if (state.notesSaveTimer) saveNotes();
  state.selectedDate = d.date;
  $("panelDayTitle").textContent =
    `Horários - ${d.weekday}, ${d.day} ${d.month}` + (d.is_today ? " (hoje)" : "");
  loadSlots();
  loadNotes(d.date);
  startPolling();
}

function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(loadSlots, 8000);
}
function stopPolling() {
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
}

async function loadSlots() {
  if (!state.selectedDate) return;
  const { ok, status, data } = await api("/api/admin/slots?date=" + state.selectedDate);
  if (status === 401) { logout(); toast("Sessão expirada, entre novamente.", "error"); return; }
  if (!ok) return;

  const list = $("adminList");
  const slots = data.slots || [];
  if (slots.length === 0) {
    list.innerHTML = '<div class="empty">Nenhum horário configurado.</div>';
    return;
  }
  list.innerHTML = "";
  slots.forEach((s) => {
    const card = document.createElement("div");
    card.className = "appt slot-row";
    let infoHtml, btnHtml;

    if (s.appointment) {
      // Horario com cliente marcado
      infoHtml =
        `<div class="svc">${s.time} &middot; ${escapeHtml(s.appointment.service)}</div>` +
        `<div class="who">${escapeHtml(s.appointment.name)} &middot; ` +
        `<span class="phone-copy" role="button" tabindex="0" ` +
        `data-phone="${escapeHtml(s.appointment.phone)}" ` +
        `title="Clique para copiar">${formatPhone(s.appointment.phone)}</span></div>`;
      btnHtml = `<button class="btn btn-danger" data-cancel="${s.appointment.id}">Desmarcar</button>`;
    } else if (s.blocked) {
      // Horario bloqueado pelo admin
      card.classList.add("blocked");
      infoHtml =
        `<div class="svc">${s.time} &middot; 🔒 Bloqueado</div>` +
        `<div class="who">Indisponível para clientes</div>`;
      btnHtml = `<button class="btn btn-secondary" data-unblock="${s.time}">Desbloquear</button>`;
    } else if (s.past) {
      // Horario livre que ja passou
      card.classList.add("past");
      infoHtml =
        `<div class="svc">${s.time}</div>` +
        `<div class="who">Horário já passou</div>`;
      btnHtml = "";
    } else {
      // Horario livre e disponivel
      infoHtml =
        `<div class="svc">${s.time}</div>` +
        `<div class="who">Livre</div>`;
      btnHtml = `<button class="btn btn-ghost" data-block="${s.time}">Bloquear</button>`;
    }

    card.innerHTML = `<div class="info">${infoHtml}</div>${btnHtml}`;
    list.appendChild(card);
  });

  list.querySelectorAll("[data-cancel]").forEach((b) => {
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-cancel");
      confirmModal("Desmarcar horário",
        "Tem certeza que deseja desmarcar este horário? Ele voltará a ficar disponível.",
        () => cancelAppointment(id));
    });
  });
  list.querySelectorAll("[data-block]").forEach((b) => {
    b.addEventListener("click", () => {
      const time = b.getAttribute("data-block");
      confirmModal("Bloquear horário",
        `Bloquear o horário das ${time}? Nenhum cliente poderá marcar neste horário.`,
        () => blockSlot(time));
    });
  });
  list.querySelectorAll("[data-unblock]").forEach((b) => {
    b.addEventListener("click", () => {
      const time = b.getAttribute("data-unblock");
      unblockSlot(time);
    });
  });
  list.querySelectorAll(".phone-copy").forEach((el) => {
    el.addEventListener("click", () => copyPhone(el));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); copyPhone(el); }
    });
  });
}

// Copia o telefone (apenas digitos) para a area de transferencia, com
// feedback visual. Usa a Clipboard API quando disponivel e cai para um
// fallback (textarea + execCommand) em contexto HTTP nao-seguro.
async function copyPhone(el) {
  const digits = (el.getAttribute("data-phone") || "").replace(/\D/g, "");
  if (!digits) return;
  let done = false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(digits);
      done = true;
    }
  } catch (e) { /* cai para o fallback abaixo */ }
  if (!done) {
    try {
      const ta = document.createElement("textarea");
      ta.value = digits;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      done = document.execCommand("copy");
      document.body.removeChild(ta);
    } catch (e) { done = false; }
  }
  if (done) {
    const original = el.textContent;
    el.classList.add("copied");
    el.textContent = "Copiado ✓";
    toast("Telefone copiado.", "success");
    setTimeout(() => { el.textContent = original; el.classList.remove("copied"); }, 1200);
  } else {
    toast("Não foi possível copiar.", "error");
  }
}

async function cancelAppointment(id) {
  const { ok, status, data } = await api("/api/admin/appointments/" + id, { method: "DELETE" });
  if (status === 401) { logout(); return; }
  if (ok) {
    toast("Horário desmarcado e disponível novamente.", "success");
    loadSlots();
  } else {
    toast(data.error || "Erro ao desmarcar.", "error");
  }
}

async function blockSlot(time) {
  const { ok, status, data } = await api("/api/admin/blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: state.selectedDate, time }),
  });
  if (status === 401) { logout(); return; }
  if (ok) {
    toast("Horário bloqueado.", "success");
    loadSlots();
  } else {
    toast(data.error || "Erro ao bloquear.", "error");
  }
}

async function unblockSlot(time) {
  const { ok, status, data } = await api("/api/admin/blocks", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: state.selectedDate, time }),
  });
  if (status === 401) { logout(); return; }
  if (ok) {
    toast("Horário liberado novamente.", "success");
    loadSlots();
  } else {
    toast(data.error || "Erro ao desbloquear.", "error");
  }
}

// ---------------------------------------------------------------------------
// Observacoes do dia
// ---------------------------------------------------------------------------
async function loadNotes(dateStr) {
  state.notesDate = dateStr;
  if (state.notesSaveTimer) { clearTimeout(state.notesSaveTimer); state.notesSaveTimer = null; }
  const ta = $("dayNotes");
  ta.value = "";
  $("notesStatus").textContent = "";
  $("notesSection").classList.remove("hidden");

  const { ok, data } = await api("/api/admin/notes?date=" + dateStr);
  // Se o admin ja trocou de dia, ignora a resposta deste (dia antigo).
  if (ok && state.notesDate === dateStr) {
    ta.value = data.note || "";
  }
}

function scheduleSaveNotes() {
  $("notesStatus").textContent = "Editando…";
  if (state.notesSaveTimer) clearTimeout(state.notesSaveTimer);
  state.notesSaveTimer = setTimeout(saveNotes, 1000);
}

async function saveNotes() {
  if (state.notesSaveTimer) { clearTimeout(state.notesSaveTimer); state.notesSaveTimer = null; }
  const dateStr = state.notesDate;
  if (!dateStr) return;
  const note = $("dayNotes").value;
  $("notesStatus").textContent = "Salvando…";
  const { ok, status, data } = await api("/api/admin/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: dateStr, note }),
  });
  if (status === 401) { logout(); return; }
  // So atualiza o status se ainda estivermos no mesmo dia.
  if (state.notesDate === dateStr) {
    $("notesStatus").textContent = ok ? "Salvo ✓" : (data.error || "Erro ao salvar");
  }
}

function formatPhone(digits) {
  digits = (digits || "").replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
  return digits;
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

window.addEventListener("DOMContentLoaded", init);
