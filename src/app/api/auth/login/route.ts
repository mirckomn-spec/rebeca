import { NextResponse } from "next/server";
import { createSessionCookie } from "@/lib/auth";
import { ALLOWED_USERS, getUserRole } from "@/lib/users";
import { findSiteUser, isPermanentlyRemoved, verifyPassword } from "@/lib/site-users";

export async function POST(request: Request) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json(
      { error: "Informe usuario e senha." },
      { status: 400 },
    );
  }

  const normalizedUsername = String(username).trim().toLowerCase();
  const plainPassword = String(password);

  if (normalizedUsername === "bel") {
    const expectedPassword = ALLOWED_USERS.bel;
    if (!expectedPassword || plainPassword !== expectedPassword) {
      return NextResponse.json({ error: "Login invalido." }, { status: 401 });
    }
    await createSessionCookie({
      userId: normalizedUsername,
      username: normalizedUsername,
      role: "admin",
    });
    return NextResponse.json({
      ok: true,
      role: "admin",
      redirect: "/dashboard",
    });
  }

  if (await isPermanentlyRemoved(normalizedUsername)) {
    return NextResponse.json({ error: "Login invalido." }, { status: 401 });
  }

  const siteUser = await findSiteUser(normalizedUsername);
  if (siteUser) {
    if (siteUser.deleted) {
      return NextResponse.json(
        {
          error:
            "Esta conta foi encerrada e nao pode mais acessar o site. Em caso de duvida, fale com a Bel.",
        },
        { status: 403 },
      );
    }
    if (siteUser.blocked) {
      const motivo = siteUser.blockedReason?.trim() || "Sem motivo informado.";
      return NextResponse.json(
        {
          error: `Sua conta esta bloqueada e nao pode entrar no momento. Motivo: ${motivo}`,
          blockedReason: motivo,
          redirect: `/bloqueado?motivo=${encodeURIComponent(motivo)}`,
        },
        { status: 403 },
      );
    }
    const sitePasswordOk = await verifyPassword(plainPassword, siteUser.passwordHash);
    const legacyPassword = ALLOWED_USERS[normalizedUsername];
    const legacyPasswordOk = Boolean(legacyPassword && plainPassword === legacyPassword);
    if (!sitePasswordOk && !legacyPasswordOk) {
      return NextResponse.json({ error: "Login invalido." }, { status: 401 });
    }
    const role = getUserRole(normalizedUsername);
    await createSessionCookie({
      userId: normalizedUsername,
      username: normalizedUsername,
      role,
    });
    return NextResponse.json({
      ok: true,
      role,
      redirect: role === "admin" ? "/dashboard" : "/painel",
    });
  }

  const expectedPassword = ALLOWED_USERS[normalizedUsername];
  if (!expectedPassword || plainPassword !== expectedPassword) {
    return NextResponse.json({ error: "Login invalido." }, { status: 401 });
  }

  const role = getUserRole(normalizedUsername);
  await createSessionCookie({
    userId: normalizedUsername,
    username: normalizedUsername,
    role,
  });

  return NextResponse.json({
    ok: true,
    role,
    redirect: role === "admin" ? "/dashboard" : "/painel",
  });
}
