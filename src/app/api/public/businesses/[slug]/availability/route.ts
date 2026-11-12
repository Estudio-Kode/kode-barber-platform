import { NextRequest, NextResponse } from "next/server";
import {
  getPublicAvailableTimes,
  resolveBookingBarber,
} from "@/lib/public-booking";
import { parseIsoDateLocal } from "@/lib/domain";
import {
  dbGetPublicBookingState,
  dbGetPublicBusinessBySlug,
} from "@/lib/supabase-server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const date = (req.nextUrl.searchParams.get("date") || "").trim();
  const serviceId = (req.nextUrl.searchParams.get("service_id") || "").trim();
  const rawBarberId = (req.nextUrl.searchParams.get("barber_id") || "").trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json({ error: "Barbearia não encontrada." }, { status: 404 });
  }
  if (!parseIsoDateLocal(date) || !UUID_PATTERN.test(serviceId)) {
    return NextResponse.json(
      { error: "Informe uma data e um serviço válidos." },
      { status: 400 }
    );
  }
  if (rawBarberId && !UUID_PATTERN.test(rawBarberId)) {
    return NextResponse.json({ error: "Barbeiro inválido." }, { status: 400 });
  }

  try {
    const profile = await dbGetPublicBusinessBySlug(slug);
    if (!profile || profile.status !== "active") {
      return NextResponse.json(
        { error: "O agendamento desta barbearia não está disponível." },
        { status: 404 }
      );
    }
    const service = profile.services.find((item) => item.id === serviceId);
    if (!service || service.direct_only) {
      return NextResponse.json(
        { error: "Este serviço não pode ser agendado online." },
        { status: 400 }
      );
    }

    const barberId = resolveBookingBarber(
      profile,
      serviceId,
      rawBarberId || null
    );
    if (barberId === undefined) {
      return NextResponse.json(
        { error: "Selecione um barbeiro disponível para este serviço." },
        { status: 400 }
      );
    }

    const state = await dbGetPublicBookingState(profile.id, date);
    const times = getPublicAvailableTimes(
      profile,
      service,
      barberId,
      date,
      state
    );
    return NextResponse.json({ times });
  } catch (error) {
    console.error("[GET /api/public/businesses/:slug/availability]", error);
    return NextResponse.json(
      { error: "Não foi possível consultar os horários." },
      { status: 500 }
    );
  }
}
