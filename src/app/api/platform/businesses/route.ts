import { NextRequest, NextResponse } from "next/server";
import { isPlatformAdminAuthenticated } from "@/lib/auth";
import { normalizePhone, sanitizeText } from "@/lib/domain";
import {
  dbCreatePlatformBusiness,
  dbGetPlatformBusinesses,
  dbGetPlatformPlans,
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

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdminAuthenticated(req))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const businesses = await dbGetPlatformBusinesses();
    return NextResponse.json({ businesses });
  } catch (error) {
    console.error("[GET /api/platform/businesses]", error);
    return NextResponse.json(
      { error: "Não foi possível carregar as barbearias." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await isPlatformAdminAuthenticated(req))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const parsed = await readSafeJson(req);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status }
    );
  }

  const data = parsed.data;
  const name = sanitizeText(data.name, 80);
  const slugSource = sanitizeText(data.slug, 80) || name;
  const slug = normalizeSlug(slugSource);
  const ownerName = sanitizeText(data.owner_name, 80);
  const email = sanitizeText(data.email, 120).toLowerCase();
  const whatsapp = normalizePhone(data.whatsapp);
  const planId = typeof data.plan_id === "string" ? data.plan_id : "";

  if (name.length < 2 || ownerName.length < 2) {
    return NextResponse.json(
      { error: "Informe o nome da barbearia e o responsável." },
      { status: 400 }
    );
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json(
      { error: "Informe um endereço curto válido para a barbearia." },
      { status: 400 }
    );
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Informe um e-mail válido." },
      { status: 400 }
    );
  }
  if (whatsapp.length < 10 || whatsapp.length > 13) {
    return NextResponse.json(
      { error: "Informe um WhatsApp com DDD." },
      { status: 400 }
    );
  }
  if (!UUID_PATTERN.test(planId)) {
    return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  }

  try {
    const plans = await dbGetPlatformPlans();
    const plan = plans.find((item) => item.id === planId && item.active);
    if (!plan) {
      return NextResponse.json(
        { error: "Selecione um plano ativo." },
        { status: 400 }
      );
    }

    const business = await dbCreatePlatformBusiness({
      slug,
      name,
      owner_name: ownerName,
      email,
      whatsapp,
      plan_id: plan.id,
      plan_price_cents: plan.price_cents,
    });
    return NextResponse.json({ business }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/platform/businesses]", error);
    return NextResponse.json(
      {
        error:
          errorStatus(error) === 409
            ? "Já existe uma barbearia com esse endereço."
            : "Não foi possível cadastrar a barbearia.",
      },
      { status: errorStatus(error) }
    );
  }
}
