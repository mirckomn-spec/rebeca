import { NextResponse } from "next/server";
import { createSessionCookie } from "@/lib/auth";
import { ALLOWED_USERS, getUserRole } from "@/lib/users";
import { findSiteUser, isPermanentlyRemoved, verifyPassword } from "@/lib/site-users";
import { getClientIp, takeRateLimitSlot } from "@/lib/rate-limit";
import { jsonNoStore, NO_STORE_HEADERS } from "@/lib/http";

const LOGIN_COOLDOWN_MS = 3000;
const GENERIC_LOGIN_ERROR = "Login invalido.";

function tooManyResponse(retryAfterMs: number) {
  return NextResponse.json(
    {
      error: `Aguarde ${Math.ceil(retryAfterMs / 1000)}s antes de tentar novamente.`,
      retryAfterMs,
    },
    {
      status: 429,
      headers: {
        ...NO_STORE_HEADERS,
        "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
      },
    },
  );
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const body = await request.json().catch(() => ({} as { username?: unknown; password?: unknown }));
  const usernameRaw = typeof body.username === "string" ? body.username : "";
  const passwordRaw = typeof body.password === "string" ? body.password : "";
  const normalizedUsername = usernameRaw.trim().toLowerCase();

  // Rate-limit por IP (sempre) e por (IP, username) — bloqueia spam mesmo
  // que o atacante varie o username.
  const ipSlot = takeRateLimitSlot(`login:ip:${ip}`, LOGIN_COOLDOWN_MS);
  if (!ipSlot.allowed) {
    return tooManyResponse(ipSlot.retryAfterMs);
  }
  if (normalizedUsername) {
    const userSlot = takeRateLimitSlot(
      `login:user:${ip}:${normalizedUsername}`,
      LOGIN_COOLDOWN_MS,
    );
    if (!userSlot.allowed) {
      return tooManyResponse(userSlot.retryAfterMs);
    }
  }

  if (!normalizedUsername || !passwordRaw) {
    return jsonNoStore({ error: "Informe usuario e senha." }, { status: 400 });
  }

  if (normalizedUsername === "bel") {
    const expectedPassword = ALLOWED_USERS.bel;
    if (!expectedPassword || passwordRaw !== expectedPassword) {
      return jsonNoStore({ error: GENERIC_LOGIN_ERROR }, { status: 401 });
    }
    await createSessionCookie({
      userId: normalizedUsername,
      username: normalizedUsername,
      role: "admin",
    });
    return jsonNoStore({
      ok: true,
      role: "admin",
      redirect: "/dashboard",
    });
  }

  if (await isPermanentlyRemoved(normalizedUsername)) {
    return jsonNoStore({ error: GENERIC_LOGIN_ERROR }, { status: 401 });
  }

  const siteUser = await findSiteUser(normalizedUsername);
  if (siteUser) {
    const sitePasswordOk = await verifyPassword(passwordRaw, siteUser.passwordHash);
    const legacyPassword = ALLOWED_USERS[normalizedUsername];
    const legacyPasswordOk = Boolean(legacyPassword && passwordRaw === legacyPassword);
    if (!sitePasswordOk && !legacyPasswordOk) {
      return jsonNoStore({ error: GENERIC_LOGIN_ERROR }, { status: 401 });
    }
    if (siteUser.deleted) {
      return jsonNoStore(
        {
          error:
            "Esta conta foi encerrada e nao pode mais acessar o site. Em caso de duvida, fale com a Bel.",
        },
        { status: 403 },
      );
    }
    if (siteUser.blocked) {
      const motivo = siteUser.blockedReason?.trim() || "Sem motivo informado.";
      return jsonNoStore(
        {
          error: `Sua conta esta bloqueada. Motivo: ${motivo}`,
          redirect: "/bloqueado",
        },
        { status: 403 },
      );
    }
    const role = getUserRole(normalizedUsername);
    await createSessionCookie({
      userId: normalizedUsername,
      username: normalizedUsername,
      role,
    });
    return jsonNoStore({
      ok: true,
      role,
      redirect: role === "admin" ? "/dashboard" : "/painel",
    });
  }

  const expectedPassword = ALLOWED_USERS[normalizedUsername];
  if (!expectedPassword || passwordRaw !== expectedPassword) {
    return jsonNoStore({ error: GENERIC_LOGIN_ERROR }, { status: 401 });
  }

  const role = getUserRole(normalizedUsername);
  await createSessionCookie({
    userId: normalizedUsername,
    username: normalizedUsername,
    role,
  });

  return jsonNoStore({
    ok: true,
    role,
    redirect: role === "admin" ? "/dashboard" : "/painel",
  });
}
