import "server-only";
import { NextResponse } from "next/server";
import { MongoUnavailableError } from "@/lib/mongodb";

/**
 * Headers padroes anti-cache para todas as respostas de API que carregam
 * dados privados do usuario. Evita que CDN/proxies guardem JSON sensivel.
 */
export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, private",
  Pragma: "no-cache",
  Expires: "0",
  "Surrogate-Control": "no-store",
} as const;

/** Resposta JSON com no-store por padrao. */
export function jsonNoStore(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): NextResponse {
  const merged = { ...NO_STORE_HEADERS, ...(init?.headers ?? {}) };
  return NextResponse.json(body, { status: init?.status, headers: merged });
}

/**
 * Tratador genérico para Mongo indisponivel. NUNCA inclui detalhes
 * tecnicos (connection string, host etc.) na resposta.
 */
export function mongoUnavailable(error: unknown) {
  if (error instanceof MongoUnavailableError) {
    return jsonNoStore(
      { error: "Servico temporariamente indisponivel. Tente novamente em instantes." },
      { status: 503 },
    );
  }
  return null;
}

/** Mensagem generica para erros internos sem vazar stack/details. */
export function internalError(message?: string) {
  return jsonNoStore(
    { error: message ?? "Erro interno. Tente novamente." },
    { status: 500 },
  );
}
