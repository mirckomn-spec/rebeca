import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { getDbRequired, MongoUnavailableError } from "@/lib/mongodb";

function mongo503(e: unknown) {
  if (e instanceof MongoUnavailableError) {
    return NextResponse.json(
      { error: "Servico temporariamente indisponivel. Tente novamente em instantes." },
      { status: 503 },
    );
  }
  return null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ username: string }> },
) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const { username } = await context.params;
  const normalized = username.toLowerCase();

  if (normalized === "bel") {
    return NextResponse.json({ error: "Avatar nao disponivel." }, { status: 404 });
  }

  try {
    const db = await getDbRequired();
    const profile = await db
      .collection("profiles")
      .findOne<{ avatarUrl?: string }>({
        username: normalized,
      });
    if (!profile?.avatarUrl) {
      return NextResponse.json({ error: "Avatar nao encontrado." }, { status: 404 });
    }

    return NextResponse.redirect(profile.avatarUrl);
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }
}
