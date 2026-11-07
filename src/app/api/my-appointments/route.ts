import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      error:
        "A consulta online está temporariamente indisponível. Fale com o barbeiro pelo WhatsApp.",
    },
    { status: 410 }
  );
}

