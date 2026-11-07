/**
 * Bateria automatizada de testes de integração para o Ziah Cortes (Next.js + Supabase).
 * Sobe o servidor Next.js compilado em uma porta de teste, executa todos os cenários
 * de cliente, regras de negócio, segurança e painel admin, e limpa os dados de teste ao final.
 */

import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;
const TEST_PHONE = "31988887777";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${BASE}/api/config`);
      if (res.ok) return;
    } catch {
      // ignore
    }
    await sleep(300);
  }
  throw new Error("Servidor Next.js não iniciou dentro do tempo esperado.");
}

async function reqJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

async function runTests() {
  console.log("▶ Iniciando servidor Next.js de produção na porta", PORT);
  const srv = spawn(
    process.execPath,
    ["./node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "production" },
    }
  );

  let createdIds = [];
  let adminToken = "";
  let testDate1 = "";
  let testDate2 = "";

  try {
    await waitForServer();
    console.log("✓ Servidor online\n");

    // 1. /api/config
    {
      const { status, data } = await reqJson("/api/config");
      assert.equal(status, 200);
      assert.equal(data.business_name, "Ziah Cortes");
      assert.equal(Array.isArray(data.services), true);
      assert.equal(data.services.length, 14);
      console.log("✓ [1/12] GET /api/config retornou os 14 serviços da Ziah Cortes");
    }

    // 2. /api/days
    {
      const { status, data } = await reqJson("/api/days");
      assert.equal(status, 200);
      assert.equal(Array.isArray(data.days), true);
      assert.equal(data.days.length > 10, true);
      // Escolhe os dois últimos dias futuros da janela para garantir que nenhum horário já passou
      testDate1 = data.days[data.days.length - 2].date;
      testDate2 = data.days[data.days.length - 1].date;
      console.log(`✓ [2/12] GET /api/days retornou ${data.days.length} dias abertos (datas de teste: ${testDate1}, ${testDate2})`);
    }

    // 3. /api/availability
    {
      const { status, data } = await reqJson(`/api/availability?date=${testDate1}`);
      assert.equal(status, 200);
      assert.equal(data.date, testDate1);
      assert.equal(data.slots.length, 10);
      console.log("✓ [3/12] GET /api/availability retornou 10 horários do dia");
    }

    // 4. Rotas de consulta/cancelamento público bloqueadas com 410 Gone
    {
      const r1 = await reqJson(`/api/my-appointments?phone=${TEST_PHONE}`);
      assert.equal(r1.status, 410);
      const r2 = await reqJson(`/api/appointments/99999`, { method: "DELETE" });
      assert.equal(r2.status, 410);
      console.log("✓ [4/12] Consulta e cancelamento públicos sem autenticação bloqueados (410 Gone)");
    }

    // 5. Rejeitar serviço combinado (Botox)
    {
      const { status, data } = await reqJson("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Cliente Teste",
          phone: TEST_PHONE,
          service: "Botox",
          date: testDate1,
          time: "10:00",
        }),
      });
      assert.equal(status, 400);
      assert.match(data.error, /combinado direto com o barbeiro/i);
      console.log("✓ [5/12] Serviço direto ('Botox') bloqueado pelo servidor com aviso de WhatsApp");
    }

    // 6. Criar agendamento válido com adicional de Sobrancelha
    {
      const { status, data } = await reqJson("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Cliente Teste QA",
          phone: TEST_PHONE,
          service: "Corte",
          sobrancelha: true,
          date: testDate1,
          time: "10:00",
        }),
      });
      assert.equal(status, 201);
      assert.equal(data.ok, true);
      assert.equal(data.appointment.service, "Corte + Sobrancelha");
      createdIds.push(data.appointment.id);
      console.log(`✓ [6/12] Agendamento criado no Supabase (ID #${data.appointment.id}: Corte + Sobrancelha)`);
    }

    // 7. Bloquear segundo cliente no mesmo dia e horário (Concorrência / UNIQUE)
    {
      const { status, data } = await reqJson("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Outro Cliente",
          phone: "31977776666",
          service: "Barba",
          date: testDate1,
          time: "10:00",
        }),
      });
      assert.equal(status, 409);
      assert.match(data.error, /ocupado/i);
      console.log("✓ [7/12] Duplo agendamento no mesmo horário bloqueado com 409 Conflict");
    }

    // 8. Regra de limite semanal (avisa com code=week_limit e permite com confirm_week=true)
    {
      const rWarn = await reqJson("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Cliente Teste QA",
          phone: TEST_PHONE,
          service: "Barba",
          date: testDate1,
          time: "11:00",
          confirm_week: false,
        }),
      });
      assert.equal(rWarn.status, 409);
      assert.equal(rWarn.data.code, "week_limit");

      const rConfirm = await reqJson("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Cliente Teste QA",
          phone: TEST_PHONE,
          service: "Barba",
          date: testDate1,
          time: "11:00",
          confirm_week: true,
        }),
      });
      assert.equal(rConfirm.status, 201);
      createdIds.push(rConfirm.data.appointment.id);
      console.log("✓ [8/12] Limite semanal retornou aviso (week_limit) e permitiu após confirmação");
    }

    // 9. Autenticação Admin (rejeita sem token, rejeita senha errada, aprova senha correta)
    {
      const unauth = await reqJson(`/api/admin/slots?date=${testDate1}`);
      assert.equal(unauth.status, 401);

      const wrongPass = await reqJson("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "wrong-password" }),
      });
      assert.equal(wrongPass.status, 401);

      const okLogin = await reqJson("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: process.env.BARBER_ADMIN_USER || "admin",
          password: process.env.BARBER_ADMIN_PASSWORD || "275543@ZC",
        }),
      });
      assert.equal(okLogin.status, 200);
      assert.equal(okLogin.data.ok, true);
      assert.equal(typeof okLogin.data.token, "string");
      adminToken = okLogin.data.token;
      console.log("✓ [9/12] Login Admin e proteção de rotas autenticadas validados");
    }

    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    };

    // 10. Bloqueio e desbloqueio de horário pelo Admin
    {
      // Tentar bloquear horário já ocupado (10:00) deve retornar 409
      const blockTaken = await reqJson("/api/admin/blocks", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ date: testDate1, time: "10:00" }),
      });
      assert.equal(blockTaken.status, 409);

      // Bloquear horário livre (15:00)
      const blockFree = await reqJson("/api/admin/blocks", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ date: testDate1, time: "15:00" }),
      });
      assert.equal(blockFree.status, 200);

      // Tentar agendar como cliente às 15:00 deve retornar 409 blocked
      const tryBookBlocked = await reqJson("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Outro Cliente",
          phone: "31966665555",
          service: "Corte",
          date: testDate1,
          time: "15:00",
        }),
      });
      assert.equal(tryBookBlocked.status, 409);
      assert.equal(tryBookBlocked.data.code, "blocked");

      // Desbloquear 15:00
      const unblock = await reqJson("/api/admin/blocks", {
        method: "DELETE",
        headers: authHeaders,
        body: JSON.stringify({ date: testDate1, time: "15:00" }),
      });
      assert.equal(unblock.status, 200);
      console.log("✓ [10/12] Bloqueio e desbloqueio de horários pelo Admin funcionando");
    }

    // 11. Observações do dia pelo Admin
    {
      const saveNote = await reqJson("/api/admin/notes", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          date: testDate2,
          note: "Observação de teste automatizado",
        }),
      });
      assert.equal(saveNote.status, 200);

      const getNote = await reqJson(`/api/admin/notes?date=${testDate2}`, {
        headers: authHeaders,
      });
      assert.equal(getNote.status, 200);
      assert.equal(getNote.data.note, "Observação de teste automatizado");

      // Limpa observação
      await reqJson("/api/admin/notes", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ date: testDate2, note: "" }),
      });
      console.log("✓ [11/12] Salvamento, leitura e limpeza de observações do dia validados");
    }

    // 12. Desmarcar agendamentos de teste pelo Admin
    {
      for (const id of createdIds) {
        const del = await reqJson(`/api/admin/appointments/${id}`, {
          method: "DELETE",
          headers: authHeaders,
        });
        assert.equal(del.status, 200);
      }
      createdIds = [];
      console.log("✓ [12/12] Cancelamento administrativo e limpeza dos agendamentos de teste concluídos");
    }

    console.log("\n🎉 TODOS OS 12 TESTES DE INTEGRAÇÃO PASSARAM COM SUCESSO!");
  } finally {
    srv.kill();
  }
}

runTests().catch((err) => {
  console.error("\n❌ FALHA NOS TESTES:", err);
  process.exit(1);
});

