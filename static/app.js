"use strict";

// ---------------------------------------------------------------------------
// Estado e config
// ---------------------------------------------------------------------------
const state = {
  config: null,
  user: { name: "", phone: "" }, // phone = apenas digitos
  service: null,
  selectedDate: null,
  selectedTime: null,
  pollTimer: null,
  bookedWeeks: [],   // semanas (segunda em ISO) que o cliente ja tem marcadas
  weekLimit: 1,      // marcacoes permitidas por semana no site
  sobrancelha: false,   // adicional de sobrancelha escolhido
  serviceDisplay: null, // nome exibido (pode incluir "+ Sobrancelha")
};

// Pergunta se o cliente quer adicionar sobrancelha. Resolve true/false.
function askSobrancelha(addon) {
  return new Promise(function (resolve) {
    const modal = $("addonModal");
    $("addonText").textContent = `Deseja incluir sobrancelha? (+ ${currencyOf()} ${addon})`;
    modal.classList.remove("hidden");
    function cleanup(val) {
      modal.classList.add("hidden");
      $("addonYes").removeEventListener("click", onYes);
      $("addonNo").removeEventListener("click", onNo);
      modal.removeEventListener("click", onBackdrop);
      resolve(val);
    }
    function onYes() { cleanup(true); }
    function onNo() { cleanup(false); }
    function onBackdrop(e) { if (e.target === modal) cleanup(false); }
    $("addonYes").addEventListener("click", onYes);
    $("addonNo").addEventListener("click", onNo);
    modal.addEventListener("click", onBackdrop);
  });
}

// Chave da semana (segunda-feira em ISO) que contem a data informada.
function weekStartKey(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = (dt.getDay() + 6) % 7; // 0 = segunda
  dt.setDate(dt.getDate() - wd);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

// Avisa que o cliente ja tem horario nesta semana e pergunta se quer
// prosseguir mesmo assim. Resolve true (prosseguir) ou false (sair).
function askWeekConfirm() {
  return new Promise(function (resolve) {
    const modal = $("weekModal");
    modal.classList.remove("hidden");
    function cleanup(val) {
      modal.classList.add("hidden");
      $("weekYes").removeEventListener("click", onYes);
      $("weekNo").removeEventListener("click", onNo);
      modal.removeEventListener("click", onBackdrop);
      resolve(val);
    }
    function onYes() { cleanup(true); }
    function onNo() { cleanup(false); }
    function onBackdrop(e) { if (e.target === modal) cleanup(false); }
    $("weekYes").addEventListener("click", onYes);
    $("weekNo").addEventListener("click", onNo);
    modal.addEventListener("click", onBackdrop);
  });
}

const WD_FULL = { "Terça": "Terça-feira", "Quarta": "Quarta-feira", "Quinta": "Quinta-feira", "Sexta": "Sexta-feira", "Sábado": "Sábado" };

// ---------------------------------------------------------------------------
// Utilitarios
// ---------------------------------------------------------------------------
function $(id) { return document.getElementById(id); }

// Escapa texto antes de inserir via innerHTML (defesa contra XSS).
function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function show(screenId) {
  ["screen-identify", "screen-menu", "screen-service", "screen-slots", "screen-manage"]
    .forEach((s) => $(s).classList.add("hidden"));
  $(screenId).classList.remove("hidden");
  stopPolling();
}

function maskPhone(digits) {
  digits = (digits || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return "(" + digits;
  if (digits.length <= 6) return "(" + digits.slice(0, 2) + ") " + digits.slice(2);
  if (digits.length <= 10)
    return "(" + digits.slice(0, 2) + ") " + digits.slice(2, 6) + "-" + digits.slice(6);
  return "(" + digits.slice(0, 2) + ") " + digits.slice(2, 7) + "-" + digits.slice(7);
}

function waLink(text) {
  const num = state.config ? state.config.whatsapp : "";
  const msg = encodeURIComponent(text || "Olá! Vim pelo site de agendamento.");
  return `https://wa.me/${num}?text=${msg}`;
}

function toast(message, type) {
  const wrap = $("toastWrap");
  const el = document.createElement("div");
  el.className = "toast " + (type || "info");
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function openModal({ icon, title, text, wa }) {
  $("modalIcon").textContent = icon || "💈";
  $("modalTitle").textContent = title || "";
  $("modalText").textContent = text || "";
  const waBtn = $("modalWa");
  if (wa) {
    waBtn.href = waLink(wa);
    waBtn.classList.remove("hidden");
  } else {
    waBtn.classList.add("hidden");
  }
  $("modal").classList.remove("hidden");
}
function closeModal() { $("modal").classList.add("hidden"); }

async function api(path, opts) {
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch (e) { /* ignore */ }
  return { ok: res.ok, status: res.status, data };
}

// ---------------------------------------------------------------------------
// Inicializacao
// ---------------------------------------------------------------------------
async function init() {
  const { data } = await api("/api/config");
  state.config = data;
  if (data.business_name) document.title = data.business_name + " - Agendamento";

  // restaura sessao do cliente
  try {
    const saved = JSON.parse(localStorage.getItem("barber_user") || "null");
    if (saved && saved.phone) {
      state.user = saved;
      goMenu();
    }
  } catch (e) { /* ignore */ }

  setupWhatsAppButtons();
  bindEvents();
}

function setupWhatsAppButtons() {
  $("waHelpSlots").href = waLink("Olá! Tenho uma dúvida sobre o agendamento.");
  $("waHelpManage").href = waLink("Olá! Preciso de ajuda com minha marcação.");
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------
function bindEvents() {
  // mascara telefone
  $("phone").addEventListener("input", (e) => {
    e.target.value = maskPhone(e.target.value);
  });

  $("identifyForm").addEventListener("submit", onIdentify);
  $("modalClose").addEventListener("click", closeModal);
  $("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

  // delegacao de acoes
  document.body.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.getAttribute("data-action");
    ({
      "logout": logout,
      "go-menu": goMenu,
      "go-book": goService,
      "go-service": goService,
      "go-manage": goManage,
      "confirm-book": confirmBook,
    }[action] || (() => {}))();
  });
}

// ---------------------------------------------------------------------------
// 1. Identificacao
// ---------------------------------------------------------------------------
function onIdentify(e) {
  e.preventDefault();
  const name = $("name").value.trim();
  const phoneDigits = $("phone").value.replace(/\D/g, "");
  $("nameError").textContent = "";
  $("phoneError").textContent = "";

  let valid = true;
  if (name.length < 2) { $("nameError").textContent = "Informe seu nome."; valid = false; }
  if (phoneDigits.length < 10 || phoneDigits.length > 11) {
    $("phoneError").textContent = "Telefone inválido. Inclua DDD."; valid = false;
  }
  if (!valid) return;

  state.user = { name, phone: phoneDigits };
  localStorage.setItem("barber_user", JSON.stringify(state.user));
  goMenu();
}

function logout() {
  localStorage.removeItem("barber_user");
  state.user = { name: "", phone: "" };
  $("name").value = "";
  $("phone").value = "";
  show("screen-identify");
}

// ---------------------------------------------------------------------------
// 2. Menu
// ---------------------------------------------------------------------------
function goMenu() {
  const first = state.user.name.split(" ")[0] || "";
  $("greeting").textContent = "Olá, " + first + "!";
  show("screen-menu");
}

// ---------------------------------------------------------------------------
// 3. Servicos
// ---------------------------------------------------------------------------
function currencyOf() { return (state.config && state.config.currency) || "R$"; }

function goService() {
  const list = $("serviceList");
  list.innerHTML = "";
  const cur = currencyOf();
  state.config.services.forEach((svc) => {
    const name = (typeof svc === "object" && svc) ? svc.name : svc;
    const price = (typeof svc === "object" && svc) ? svc.price : null;
    const addon = (typeof svc === "object" && svc) ? svc.addon_sobrancelha : null;
    const isDirect = state.config.direct_services.includes(name);
    const item = document.createElement("div");
    item.className = "service-item" + (isDirect ? " direct" : "");
    item.innerHTML =
      `<span class="svc-name">${escapeHtml(name)}${isDirect ? '<span class="tag">combinar</span>' : ""}</span>` +
      (isDirect
        ? `<span class="arrow">💬</span>`
        : (price != null ? `<span class="price">${cur} ${price}</span>` : `<span class="arrow">→</span>`));
    item.addEventListener("click", () => selectService(name, isDirect, price, addon));
    list.appendChild(item);
  });
  show("screen-service");
}

async function selectService(svc, isDirect, price, addon) {
  if (isDirect) {
    // 3.1 atendimento direto
    openModal({
      icon: "💬",
      title: "Atendimento combinado",
      text: `O serviço "${svc}" precisa ser combinado diretamente com o barbeiro. ` +
            `Toque no botão abaixo para falar no WhatsApp.`,
      wa: `Olá! Gostaria de agendar: ${svc}.`,
    });
    return;
  }

  // Adicional de sobrancelha (Corte, Barba, Corte + Barba)
  state.sobrancelha = false;
  let displayName = svc;
  let finalPrice = (price != null) ? price : null;
  if (addon != null) {
    const yes = await askSobrancelha(addon);
    if (yes) {
      state.sobrancelha = true;
      displayName = svc + " + Sobrancelha";
      finalPrice = (finalPrice != null ? finalPrice : 0) + addon;
    }
  }

  // 3.2
  state.service = svc;               // nome-base enviado ao servidor
  state.serviceDisplay = displayName;
  state.servicePrice = finalPrice;
  state.selectedDate = null;
  state.selectedTime = null;
  const priceLabel = (finalPrice != null) ? ` — ${currencyOf()} ${finalPrice}` : "";
  $("chosenService").textContent = displayName + priceLabel;
  $("sumService").textContent = displayName + priceLabel;
  $("slotsArea").classList.add("hidden");
  $("confirmArea").classList.add("hidden");
  show("screen-slots");
  loadBookedWeeks().then(loadDays);
}

async function loadBookedWeeks() {
  const q = `?name=${encodeURIComponent(state.user.name)}&phone=${encodeURIComponent(state.user.phone)}`;
  const { ok, data } = await api("/api/my-appointments" + q);
  state.bookedWeeks = (ok && data.booked_weeks) ? data.booked_weeks : [];
  state.weekLimit = (data && data.week_limit != null) ? data.week_limit : 1;
}

// ---------------------------------------------------------------------------
// 3.2 Dias e horarios
// ---------------------------------------------------------------------------
async function loadDays() {
  const { data } = await api("/api/days");
  const wrap = $("daysScroll");
  wrap.innerHTML = "";
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
  });
}

function selectDay(d, chip) {
  document.querySelectorAll(".day-chip").forEach((c) => c.classList.remove("selected"));
  chip.classList.add("selected");
  state.selectedDate = d.date;
  state.selectedTime = null;
  $("confirmArea").classList.add("hidden");
  $("slotsArea").classList.remove("hidden");
  $("sumDate").textContent = `${WD_FULL[d.weekday] || d.weekday}, ${d.day} ${d.month}`;
  refreshSlots();
  startPolling();
}

function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(refreshSlots, 5000);
}
function stopPolling() {
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
}

async function refreshSlots() {
  if (!state.selectedDate) return;
  const { ok, data } = await api(`/api/availability?date=${state.selectedDate}`);
  if (!ok) return;
  renderSlots("slotsMorning", data.slots.filter((s) => s.time < "12:00"));
  renderSlots("slotsAfternoon", data.slots.filter((s) => s.time >= "12:00"));
}

function renderSlots(containerId, slots) {
  const c = $(containerId);
  c.innerHTML = "";
  slots.forEach((s) => {
    const el = document.createElement("div");
    // "too_soon": falta pouco tempo para o horario -> nao pode marcar pelo site,
    // mas continua clicavel para abrir o aviso com o link do WhatsApp.
    const blockedSlot = s.booked || s.past || s.blocked;
    el.className = "slot" +
      (blockedSlot ? " disabled" : "") +
      (s.too_soon && !blockedSlot ? " too-soon" : "") +
      (state.selectedTime === s.time ? " selected" : "");
    el.textContent = s.time;
    if (s.too_soon && !blockedSlot) {
      el.title = "Tempo limite para marcar atingido — fale no WhatsApp";
      el.addEventListener("click", () => showCutoffModal(s.time));
    } else if (!blockedSlot) {
      el.addEventListener("click", () => selectTime(s.time));
    } else if (s.booked || s.blocked) {
      el.title = "Horário indisponível";
    }
    c.appendChild(el);
  });
}

// Aviso de bloqueio por antecedencia minima: a marcacao precisa ser combinada
// direto com o barbeiro pelo WhatsApp (mensagem ja pronta).
function showCutoffModal(timeStr) {
  const mins = (state.config && state.config.booking_cutoff_minutes) || 30;
  const dateLabel = $("sumDate").textContent || "";
  const quando = dateLabel ? `${dateLabel} às ${timeStr}` : `às ${timeStr}`;
  openModal({
    icon: "⏰",
    title: "Tempo limite de marcação atingido",
    text: `Faltam menos de ${mins} minutos para o horário das ${timeStr}. ` +
          `Marcações com menos de ${mins} minutos de antecedência precisam ser ` +
          `combinadas diretamente com o barbeiro pelo WhatsApp.`,
    wa: `Olá! Gostaria de marcar o horário de ${quando}, mas o site informou que ` +
        `o tempo limite de marcação foi atingido. Esse horário ainda está disponível?`,
  });
}

function selectTime(time) {
  state.selectedTime = time;
  document.querySelectorAll(".slot").forEach((s) => {
    s.classList.toggle("selected", s.textContent === time && !s.classList.contains("disabled"));
  });
  $("sumTime").textContent = time;
  $("confirmArea").classList.remove("hidden");
  $("confirmArea").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// True se o cliente ja tem horario na semana da data informada.
function alreadyBookedThisWeek(dateIso) {
  return !!state.weekLimit && state.bookedWeeks.includes(weekStartKey(dateIso));
}

async function confirmBook() {
  if (!state.selectedDate || !state.selectedTime) {
    toast("Selecione dia e horário.", "error");
    return;
  }
  // Ja tem horario nesta semana? Avisa e deixa o cliente decidir.
  if (alreadyBookedThisWeek(state.selectedDate)) {
    const proceed = await askWeekConfirm();
    if (!proceed) return;   // "Não, sair" -> aborta a marcacao
    doBook(true);           // "Sim" -> marca mesmo assim
    return;
  }
  doBook(false);
}

// Envia a marcacao. confirmWeek=true libera a marcacao mesmo havendo outra na semana.
async function doBook(confirmWeek) {
  const btn = document.querySelector('[data-action="confirm-book"]');
  btn.disabled = true;
  const { ok, status, data } = await api("/api/appointments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: state.user.name,
      phone: state.user.phone,
      service: state.service,
      sobrancelha: state.sobrancelha,
      date: state.selectedDate,
      time: state.selectedTime,
      confirm_week: !!confirmWeek,
    }),
  });
  btn.disabled = false;

  if (ok) {
    openModal({
      icon: "✅",
      title: "Marcação confirmada!",
      text: `${state.serviceDisplay || state.service} em ${$("sumDate").textContent} às ${state.selectedTime}. Até lá!`,
    });
    if (state.weekLimit && !state.bookedWeeks.includes(weekStartKey(state.selectedDate))) {
      state.bookedWeeks.push(weekStartKey(state.selectedDate));
    }
    // Limpa a selecao e retorna para a tela inicial do cliente (menu).
    state.selectedTime = null;
    state.selectedDate = null;
    $("confirmArea").classList.add("hidden");
    $("slotsArea").classList.add("hidden");
    goMenu();
  } else if (status === 409 && data.code === "week_limit") {
    // Estado local desatualizado: o servidor detectou outro horario na semana.
    // Atualiza o controle local, pergunta e remarca se o cliente confirmar.
    if (!state.bookedWeeks.includes(weekStartKey(state.selectedDate))) {
      state.bookedWeeks.push(weekStartKey(state.selectedDate));
    }
    const proceed = await askWeekConfirm();
    if (proceed) doBook(true);
  } else if (status === 403 && data.code === "cutoff") {
    // O limite de antecedencia foi atingido entre carregar e confirmar.
    showCutoffModal(state.selectedTime);
    refreshSlots();
  } else if (status === 409) {
    toast(data.error || "Horário acabou de ser ocupado.", "error");
    refreshSlots();
  } else {
    toast(data.error || "Não foi possível marcar.", "error");
  }
}

// ---------------------------------------------------------------------------
// 2.2 Gerenciar marcacoes
// ---------------------------------------------------------------------------
async function goManage() {
  show("screen-manage");
  await loadMyAppointments();
}

async function loadMyAppointments() {
  const list = $("manageList");
  list.innerHTML = '<div class="empty">Carregando...</div>';
  const q = `?name=${encodeURIComponent(state.user.name)}&phone=${encodeURIComponent(state.user.phone)}`;
  const { data } = await api("/api/my-appointments" + q);
  const appts = data.appointments || [];

  if (appts.length === 0) {
    list.innerHTML = '<div class="empty">Você ainda não tem marcações.</div>';
    return;
  }
  list.innerHTML = "";
  appts.forEach((a) => {
    const card = document.createElement("div");
    card.className = "appt";
    const dt = formatDate(a.date);
    let btnHtml;
    if (a.can_cancel) {
      btnHtml = `<button class="btn btn-danger" data-cancel="${a.id}">Desmarcar</button>`;
    } else {
      btnHtml = `<button class="btn btn-danger" data-late="1" style="opacity:.4">Desmarcar</button>`;
    }
    card.innerHTML =
      `<div class="info">` +
      `<div class="svc">${escapeHtml(a.service)}</div>` +
      `<div class="when">${escapeHtml(dt)} às ${escapeHtml(a.time)}</div>` +
      `</div>` + btnHtml;
    list.appendChild(card);
  });

  // bind cancel
  list.querySelectorAll("[data-cancel]").forEach((b) => {
    b.addEventListener("click", () => cancelAppointment(b.getAttribute("data-cancel")));
  });
  list.querySelectorAll("[data-late]").forEach((b) => {
    b.addEventListener("click", showLateModal);
  });
}

function showLateModal() {
  openModal({
    icon: "⏰",
    title: "Aviso",
    text: "Para desmarcar com menos de 2 horas de antecedência, entre em contato diretamente com o barbeiro.",
    wa: "Olá! Preciso desmarcar um horário que é em menos de 2 horas.",
  });
}

async function cancelAppointment(id) {
  const { ok, data } = await api(`/api/appointments/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: state.user.name, phone: state.user.phone }),
  });
  if (ok) {
    toast("Marcação desmarcada.", "success");
    loadMyAppointments();
  } else if (data.code === "too_late") {
    showLateModal();
  } else {
    toast(data.error || "Não foi possível desmarcar.", "error");
  }
}

function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][dt.getDay()];
  const mo = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][m - 1];
  return `${wd}, ${d} ${mo}`;
}

window.addEventListener("DOMContentLoaded", init);
