import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { MongoUnavailableError } from "@/lib/mongodb";
import { getSiteUserPlainPassword } from "@/lib/site-users";

function mongo503(error: unknown) {
  if (error instanceof MongoUnavailableError) {
    return NextResponse.json(
      { error: "Servico temporariamente indisponivel. Tente novamente em instantes." },
      { status: 503 },
    );
  }
  return null;
}

export async function GET(request: Request) {
  const session = await getSessionFromCookie();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const username = String(searchParams.get("username") ?? "")
      .trim()
      .toLowerCase();
    if (!username) {
      return NextResponse.json({ error: "Informe o usuario." }, { status: 400 });
    }
    if (username === "bel") {
      return NextResponse.json(
        { error: "Senha da Bel nao e exibida aqui." },
        { status: 400 },
      );
    }
    const password = await getSiteUserPlainPassword(username);
    if (!password) {
      return NextResponse.json(
        {
          error:
            "Senha indisponivel. Esta conta nao tem senha em texto plano armazenada (foi criada antes deste recurso). Crie uma nova senha pelo painel.",
        },
        { status: 404 },
      );
    }
    return NextResponse.json({ username, password });
  } catch (error) {
    const m = mongo503(error);
    if (m) return m;
    const message = error instanceof Error ? error.message : "Falha ao recuperar senha.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
