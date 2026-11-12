import { NextRequest, NextResponse } from "next/server";
import { isPlatformAdminAuthenticated } from "@/lib/auth";
import { normalizePhone, sanitizeText } from "@/lib/domain";
import {
  dbGetPlatformPlans,
  dbUpdatePlatformBusiness,
  PlatformBusinessRow,
} from "@/lib/supabase-server";
import { readSafeJson } from "@/lib/request-guard";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function errorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : "";
  return /23505|duplicate key/i.test(message) ? 409 : 500;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isPlatformAdminAuthenticated(req))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "Identificador de barbearia inválido." },
      { status: 400 }
    );
  }

  const parsed = await readSafeJson(req);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status }
    );
  }

  const data = parsed.data;
  const updates: Partial<{
    slug: string;
    name: string;
    owner_name: string;
    email: string;
    whatsapp: string;
    status: PlatformBusinessRow["status"];
    plan_id: string;
    plan_price_cents: number | null;
  }> = {};

  if (data.name !== undefined) {
    const name = sanitizeText(data.name, 80);
    if (name.length < 2) {
      return NextResponse.json(
        { error: "Informe um nome válido para a barbearia." },
        { status: 400 }
      );
    }
    updates.name = name;
  }
  if (data.slug !== undefined) {
    const slug = normalizeSlug(sanitizeText(data.slug, 80));
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return NextResponse.json(
        { error: "Informe um endereço curto válido." },
        { status: 400 }
      );
    }
    updates.slug = slug;
  }
  if (data.owner_name !== undefined) {
    const ownerName = sanitizeText(data.owner_name, 80);
    if (ownerName.length < 2) {
      return NextResponse.json(
        { error: "Informe o nome do responsável." },
        { status: 400 }
      );
    }
    updates.owner_name = ownerName;
  }
  if (data.email !== undefined) {
    const email = sanitizeText(data.email, 120).toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Informe um e-mail válido." },
        { status: 400 }
      );
    }
    updates.email = email;
  }
  if (data.whatsapp !== undefined) {
    const whatsapp = normalizePhone(data.whatsapp);
    if (whatsapp.length < 10 || whatsapp.length > 13) {
      return NextResponse.json(
        { error: "Informe um WhatsApp com DDD." },
        { status: 400 }
      );
    }
    updates.whatsapp = whatsapp;
  }
  if (data.status !== undefined) {
    if (!["setup", "active", "suspended"].includes(String(data.status))) {
      return NextResponse.json(
        { error: "Status de barbearia inválido." },
        { status: 400 }
      );
    }
    updates.status = data.status as PlatformBusinessRow["status"];
  }
  if (data.plan_id !== undefined) {
    if (typeof data.plan_id !== "string" || !UUID_PATTERN.test(data.plan_id)) {
      return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
    }
    try {
      const plans = await dbGetPlatformPlans();
      const plan = plans.find(
        (item) => item.id === data.plan_id && item.active
      );
      if (!plan) {
        return NextResponse.json(
          { error: "Selecione um plano ativo." },
          { status: 400 }
        );
      }
      updates.plan_id = plan.id;
      updates.plan_price_cents = plan.price_cents;
    } catch (error) {
      console.error("[PATCH /api/platform/businesses/:id] plan lookup", error);
      return NextResponse.json(
        { error: "Não foi possível validar o plano." },
        { status: 500 }
      );
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "Nenhuma alteração válida foi informada." },
      { status: 400 }
    );
  }

  try {
    const business = await dbUpdatePlatformBusiness(id, updates);
    if (!business) {
      return NextResponse.json(
        { error: "Barbearia não encontrada." },
        { status: 404 }
      );
    }
    return NextResponse.json({ business });
  } catch (error) {
    console.error("[PATCH /api/platform/businesses/:id]", error);
    return NextResponse.json(
      {
        error:
          errorStatus(error) === 409
            ? "Já existe uma barbearia com esse endereço."
            : "Não foi possível atualizar a barbearia.",
      },
      { status: errorStatus(error) }
    );
  }
}
