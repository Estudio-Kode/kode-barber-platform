import { NextRequest, NextResponse } from "next/server";
import { isPlatformAdminAuthenticated } from "@/lib/auth";
import { isStrongPassword } from "@/lib/password-policy";
import { readSafeJson } from "@/lib/request-guard";
import {
  dbGetPlatformBusinesses,
  dbProvisionBusinessAdmin,
} from "@/lib/supabase-server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PUT(
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

  const email =
    typeof parsed.data.email === "string"
      ? parsed.data.email.trim().toLowerCase()
      : "";
  const fullName =
    typeof parsed.data.full_name === "string"
      ? parsed.data.full_name.trim().replace(/\s+/g, " ")
      : "";
  const password =
    typeof parsed.data.password === "string" ? parsed.data.password : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
    return NextResponse.json(
      { error: "Informe um e-mail de acesso válido." },
      { status: 400 }
    );
  }
  if (fullName.length < 2 || fullName.length > 80) {
    return NextResponse.json(
      { error: "Informe o nome do administrador." },
      { status: 400 }
    );
  }
  if (!isStrongPassword(password)) {
    return NextResponse.json(
      {
        error:
          "A senha temporária deve ter pelo menos 8 caracteres, uma letra maiúscula, um número e um caractere especial.",
      },
      { status: 400 }
    );
  }

  try {
    const businesses = await dbGetPlatformBusinesses();
    if (!businesses.some((business) => business.id === id)) {
      return NextResponse.json(
        { error: "Barbearia não encontrada." },
        { status: 404 }
      );
    }

    await dbProvisionBusinessAdmin({
      businessId: id,
      email,
      password,
      fullName,
    });
    return NextResponse.json({ ok: true, login_email: email });
  } catch (error) {
    console.error("[PUT /api/platform/businesses/:id/admin]", error);
    const message = error instanceof Error ? error.message : "";
    const authStatus = message.match(/SUPABASE_AUTH_(\d{3})/)?.[1];
    if (/23505|duplicate key/i.test(message) || authStatus === "422") {
      return NextResponse.json(
        {
          error:
            "Este e-mail já está vinculado a outra conta ou barbearia. Use um e-mail exclusivo.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Não foi possível configurar o acesso do administrador." },
      { status: 500 }
    );
  }
}
