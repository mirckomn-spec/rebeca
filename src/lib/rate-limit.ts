import "server-only";

/**
 * Rate limit em memoria (por instancia warm). Suficiente para volume baixo.
 * Chave: identificador livre (ex.: `login:ip:username`, `proof:username`).
 *
 * Importante: serverless pode ter varias instancias warm, entao o limite
 * efetivo pode ser ate N instancias x quota. Para o objetivo deste projeto
 * (impedir spam basico) e suficiente.
 */

const globalWithBuckets = global as typeof globalThis & {
  __hotsRateBuckets?: Map<string, number>;
};

function buckets() {
  if (!globalWithBuckets.__hotsRateBuckets) {
    globalWithBuckets.__hotsRateBuckets = new Map<string, number>();
  }
  return globalWithBuckets.__hotsRateBuckets;
}

/**
 * Retorna true se a acao foi permitida (e marca o tempo). Retorna false se
 * o cliente esta dentro do `windowMs` desde a ultima acao registrada.
 */
export function takeRateLimitSlot(key: string, windowMs: number): {
  allowed: boolean;
  retryAfterMs: number;
} {
  const map = buckets();
  const now = Date.now();
  const last = map.get(key) ?? 0;
  const elapsed = now - last;
  if (elapsed < windowMs) {
    return { allowed: false, retryAfterMs: windowMs - elapsed };
  }
  map.set(key, now);
  // limpeza oportunistica: remove entradas antigas para nao crescer infinito.
  if (map.size > 5000) {
    for (const [k, v] of map.entries()) {
      if (now - v > 24 * 60 * 60 * 1000) map.delete(k);
    }
  }
  return { allowed: true, retryAfterMs: 0 };
}

/** Libera o slot manualmente (use em casos de erro pre-validacao). */
export function releaseRateLimitSlot(key: string) {
  buckets().delete(key);
}

export function getClientIp(request: Request): string {
  const headers = request.headers;
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  return "unknown";
}
