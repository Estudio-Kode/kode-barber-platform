import { NextRequest, NextResponse } from "next/server";
import { isPlatformAdminAuthenticated } from "@/lib/auth";
import { sanitizeText } from "@/lib/domain";
import {
  dbCreatePlatformPlan,
  dbGetPlatformPlans,
  dbUpdatePlatformPlan,
  PlatformFeature,
} from "@/lib/supabase-server";
import { readSafeJson } from "@/lib/request-guard";

const FEATURE_KEYS: PlatformFeature[] = [
  "online_booking",
  "multiple_barbers",
  "advanced_reports",
  "client_memberships",
  "product_catalog",
];

function normalizeSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function parseFeatures(value: unknown): Record<PlatformFeature, boolean> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (FEATURE_KEYS.some((key) => typeof record[key] !== "boolean")) return null;
  return Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, record[key]])
  ) as Record<PlatformFeature, boolean>;
}

function parseLimit(value: unknown, min: number): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    return undefined;
  }
  return value;
}

function parsePrice(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 100_000_000
  ) {
    return undefined;
  }
  return value;
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
    const plans = await dbGetPlatformPlans();
    return NextResponse.json({ plans });
  } catch (error) {
    console.error("[GET /api/platform/plans]", error);
    return NextResponse.json(
      { error: "Não foi possível carregar os planos." },
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
  const description = sanitizeText(data.description, 500);
  const price = parsePrice(data.price_cents);
  const maxBarbers = parseLimit(data.max_barbers, 1);
  const maxServices = parseLimit(data.max_services, 1);
  const maxProducts = parseLimit(data.max_products, 0);
  const features = parseFeatures(data.features);
  const sortOrder = data.sort_order === undefined ? 0 : data.sort_order;

  if (name.length < 2 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json(
      { error: "Informe nome e identificador válidos para o plano." },
      { status: 400 }
    );
  }
  if (
    price === undefined ||
    maxBarbers === undefined ||
    maxBarbers === null ||
    maxServices === undefined ||
    maxProducts === undefined ||
    !features ||
    typeof sortOrder !== "number" ||
    !Number.isInteger(sortOrder)
  ) {
    return NextResponse.json(
      { error: "Confira preço, limites e recursos do plano." },
      { status: 400 }
    );
  }

  try {
    const plan = await dbCreatePlatformPlan({
      slug,
      name,
      description,
      price_cents: price,
      max_barbers: maxBarbers,
      max_services: maxServices,
      max_products: maxProducts,
      features,
      sort_order: sortOrder,
    });
    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/platform/plans]", error);
    return NextResponse.json(
      {
        error:
          errorStatus(error) === 409
            ? "Já existe um plano com esse identificador."
            : "Não foi possível criar o plano.",
      },
      { status: errorStatus(error) }
    );
  }
}

export async function PATCH(req: NextRequest) {
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

  const id = typeof parsed.data.id === "string" ? parsed.data.id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  }

  const data = parsed.data;
  const updates: Partial<{
    slug: string;
    name: string;
    description: string;
    price_cents: number | null;
    max_barbers: number;
    max_services: number | null;
    max_products: number | null;
    features: Record<PlatformFeature, boolean>;
    active: boolean;
    sort_order: number;
  }> = {};

  if (data.name !== undefined) {
    const name = sanitizeText(data.name, 80);
    if (name.length < 2) {
      return NextResponse.json({ error: "Nome inválido." }, { status: 400 });
    }
    updates.name = name;
  }
  if (data.slug !== undefined) {
    const slug = normalizeSlug(sanitizeText(data.slug, 80));
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return NextResponse.json(
        { error: "Identificador do plano inválido." },
        { status: 400 }
      );
    }
    updates.slug = slug;
  }
  if (data.description !== undefined) {
    updates.description = sanitizeText(data.description, 500);
  }
  if (data.price_cents !== undefined) {
    const price = parsePrice(data.price_cents);
    if (price === undefined) {
      return NextResponse.json({ error: "Preço inválido." }, { status: 400 });
    }
    updates.price_cents = price;
  }
  if (data.max_barbers !== undefined) {
    const limit = parseLimit(data.max_barbers, 1);
    if (limit === undefined || limit === null) {
      return NextResponse.json(
        { error: "Limite de barbeiros inválido." },
        { status: 400 }
      );
    }
    updates.max_barbers = limit;
  }
  if (data.max_services !== undefined) {
    const limit = parseLimit(data.max_services, 1);
    if (limit === undefined) {
      return NextResponse.json(
        { error: "Limite de serviços inválido." },
        { status: 400 }
      );
    }
    updates.max_services = limit;
  }
  if (data.max_products !== undefined) {
    const limit = parseLimit(data.max_products, 0);
    if (limit === undefined) {
      return NextResponse.json(
        { error: "Limite de produtos inválido." },
        { status: 400 }
      );
    }
    updates.max_products = limit;
  }
  if (data.features !== undefined) {
    const features = parseFeatures(data.features);
    if (!features) {
      return NextResponse.json(
        { error: "Recursos do plano inválidos." },
        { status: 400 }
      );
    }
    updates.features = features;
  }
  if (data.active !== undefined) {
    if (typeof data.active !== "boolean") {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }
    updates.active = data.active;
  }
  if (data.sort_order !== undefined) {
    if (
      typeof data.sort_order !== "number" ||
      !Number.isInteger(data.sort_order)
    ) {
      return NextResponse.json(
        { error: "Ordem de exibição inválida." },
        { status: 400 }
      );
    }
    updates.sort_order = data.sort_order;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "Nenhuma alteração válida foi informada." },
      { status: 400 }
    );
  }

  try {
    const plan = await dbUpdatePlatformPlan(id, updates);
    if (!plan) {
      return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ plan });
  } catch (error) {
    console.error("[PATCH /api/platform/plans]", error);
    return NextResponse.json(
      {
        error:
          errorStatus(error) === 409
            ? "Já existe um plano com esse identificador."
            : "Não foi possível atualizar o plano.",
      },
      { status: errorStatus(error) }
    );
  }
}
