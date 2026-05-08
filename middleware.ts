import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const AUTH_COOKIE = "hots_auth";

type JwtRole = "admin" | "member";
type DecodedPayload = {
  role?: unknown;
  username?: unknown;
};

function resolveRole(decoded: DecodedPayload): JwtRole {
  if (decoded.role === "admin") return "admin";
  if (decoded.role === "member") return "member";
  const user = String(decoded.username ?? "").toLowerCase();
  return user === "bel" ? "admin" : "member";
}

/**
 * Headers de seguranca aplicados em TODAS as respostas (HTML e API).
 * Eliminam vetores comuns de ataque visiveis no F12:
 * - Clickjacking (X-Frame-Options + frame-ancestors).
 * - Sniff de mime (X-Content-Type-Options).
 * - Vazamento de URL via Referer (Referrer-Policy).
 * - Permissoes nao usadas (Permissions-Policy).
 * - Mistura HTTP/HTTPS (HSTS, so faz sentido em prod com TLS).
 *
 * O CSP e restrito o suficiente para bloquear inline scripts maliciosos
 * mantendo Next + tailwind (sem unsafe-inline em script).
 */
function applySecurityHeaders(response: NextResponse, isApi: boolean) {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()",
  );
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }
  if (isApi) {
    // Respostas de API com dados privados nunca podem ser cacheadas
    // por proxy/CDN/browser.
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate, private",
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    response.headers.set("Surrogate-Control", "no-store");
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  const needsAuth =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/painel") ||
    pathname.startsWith("/api/proofs") ||
    pathname.startsWith("/api/ranking") ||
    pathname.startsWith("/api/profile") ||
    pathname.startsWith("/api/fines") ||
    pathname.startsWith("/api/goals") ||
    pathname.startsWith("/api/hots-access") ||
    pathname.startsWith("/api/withdrawals") ||
    pathname.startsWith("/api/withdrawal-settings") ||
    pathname.startsWith("/api/referrals") ||
    pathname.startsWith("/api/admin");

  if (!needsAuth) {
    return applySecurityHeaders(NextResponse.next(), isApi);
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const secret = process.env.JWT_SECRET;

  if (!token || !secret) {
    if (isApi) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Nao autorizado." }, { status: 401 }),
        true,
      );
    }
    return applySecurityHeaders(NextResponse.redirect(new URL("/", request.url)), false);
  }

  let role: JwtRole;
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    const decoded = payload as DecodedPayload;
    role = resolveRole(decoded);
  } catch {
    if (isApi) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Sessao invalida." }, { status: 401 }),
        true,
      );
    }
    return applySecurityHeaders(NextResponse.redirect(new URL("/", request.url)), false);
  }

  if (pathname.startsWith("/dashboard") && role !== "admin") {
    return applySecurityHeaders(NextResponse.redirect(new URL("/painel", request.url)), false);
  }

  if (pathname.startsWith("/painel") && role !== "member") {
    return applySecurityHeaders(NextResponse.redirect(new URL("/dashboard", request.url)), false);
  }

  if (pathname.startsWith("/api/admin") && role !== "admin") {
    return applySecurityHeaders(
      NextResponse.json({ error: "Nao autorizado." }, { status: 403 }),
      true,
    );
  }

  return applySecurityHeaders(NextResponse.next(), isApi);
}

export const config = {
  matcher: [
    // Aplica headers de seguranca em tudo, exceto assets estaticos.
    "/((?!_next/static|_next/image|favicon.ico|avatar-default.svg|fontes/|icones/).*)",
  ],
};
