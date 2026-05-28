import "server-only";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const AUTH_COOKIE = "hots_auth";

export type UserRole = "admin" | "member";

export type SessionPayload = {
  userId: string;
  username: string;
  role: UserRole;
};

function resolveRoleFromPayload(payload: jwt.JwtPayload): UserRole {
  if (payload.role === "admin") return "admin";
  if (payload.role === "member") return "member";
  const user = String(payload.username ?? "").toLowerCase();
  return user === "bel" ? "admin" : "member";
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "Defina JWT_SECRET nas variaveis de ambiente (painel de hospedagem ou .env.local).",
    );
  }
  return secret;
}

export async function createSessionCookie(payload: SessionPayload) {
  const token = jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE);
}

export async function getSessionFromCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
    return {
      userId: String(decoded.userId ?? decoded.username ?? ""),
      username: String(decoded.username ?? "").toLowerCase(),
      role: resolveRoleFromPayload(decoded),
    };
  } catch {
    return null;
  }
}
