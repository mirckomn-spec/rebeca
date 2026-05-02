import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { MongoUnavailableError } from "@/lib/mongodb";
import {
  createSiteUser,
  generateRandomPassword,
  listSiteUsersForAdmin,
  setUserBlocked,
  setUserDeleted,
} from "@/lib/site-users";
import { listMemberUsernames } from "@/lib/members";

function mongo503(error: unknown) {
  if (error instanceof MongoUnavailableError) {
    return NextResponse.json(
      { error: "Banco de dados indisponivel.", details: error.message },
      { status: 503 },
    );
  }
  return null;
}

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }
  try {
    const users = await listSiteUsersForAdmin();
    const memberRoster = await listMemberUsernames();
    return NextResponse.json({ users, memberRoster });
  } catch (error) {
    const m = mongo503(error);
    if (m) return m;
    const message = error instanceof Error ? error.message : "Falha ao listar usuarios.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }
  try {
    const body = await request.json();
    const username = String(body.username ?? "")
      .trim()
      .toLowerCase();
    const randomPassword = Boolean(body.randomPassword);
    const password = String(body.password ?? "").trim();

    if (!username || username === "bel") {
      return NextResponse.json({ error: "Informe um usuario valido." }, { status: 400 });
    }

    let plainPassword = password;
    if (randomPassword) {
      plainPassword = generateRandomPassword();
    } else if (!plainPassword) {
      return NextResponse.json(
        { error: "Informe uma senha ou marque senha aleatoria." },
        { status: 400 },
      );
    }

    await createSiteUser(username, plainPassword);
    return NextResponse.json({
      ok: true,
      username,
      generatedPassword: randomPassword ? plainPassword : undefined,
    });
  } catch (error) {
    const m = mongo503(error);
    if (m) return m;
    const message = error instanceof Error ? error.message : "Falha ao criar usuario.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSessionFromCookie();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }
  try {
    const body = await request.json();
    const username = String(body.username ?? "")
      .trim()
      .toLowerCase();
    const action = String(body.action ?? "").trim();

    if (!username) {
      return NextResponse.json({ error: "Informe o usuario." }, { status: 400 });
    }

    if (action === "block") {
      const reason = String(body.blockedReason ?? "").trim();
      await setUserBlocked(username, true, reason || null);
      return NextResponse.json({ ok: true });
    }
    if (action === "unblock") {
      await setUserBlocked(username, false, null);
      return NextResponse.json({ ok: true });
    }

    if (action === "purge") {
      await setUserDeleted(username, true, { removedBy: session.username });
      return NextResponse.json({ ok: true, mode: "hard" });
    }

    return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
  } catch (error) {
    const m = mongo503(error);
    if (m) return m;
    const message = error instanceof Error ? error.message : "Falha ao atualizar usuario.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const session = await getSessionFromCookie();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const username = String(searchParams.get("username") ?? "")
      .trim()
      .toLowerCase();
    const hard = searchParams.get("hard") === "1";

    if (!username) {
      return NextResponse.json({ error: "Informe o usuario." }, { status: 400 });
    }

    await setUserDeleted(username, hard, { removedBy: session.username });
    return NextResponse.json({ ok: true, mode: hard ? "hard" : "soft" });
  } catch (error) {
    const m = mongo503(error);
    if (m) return m;
    const message = error instanceof Error ? error.message : "Falha ao remover usuario.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
