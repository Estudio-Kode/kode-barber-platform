import { NextResponse } from "next/server";

export async function DELETE() {
  return NextResponse.json(
    {
      error:
        "O cancelamento online está temporariamente indisponível. Fale com o barbeiro pelo WhatsApp.",
    },
    { status: 410 }
  );
}

