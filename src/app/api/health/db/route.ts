import { getDbSafe } from "@/lib/mongodb";
import { jsonNoStore } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanEnv(value: string | undefined) {
  if (!value) return "";
  let v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

/** Diagnostico rapido de conexao MongoDB (sem expor URI). */
export async function GET() {
  const hasUri = cleanEnv(process.env.MONGODB_URI).length > 0;
  if (!hasUri) {
    return jsonNoStore({
      ok: false,
      configured: false,
      connected: false,
      hint: "MONGODB_URI nao esta definida no ambiente de producao.",
    });
  }

  const { db, error } = await getDbSafe();
  return jsonNoStore({
    ok: Boolean(db),
    configured: true,
    connected: Boolean(db),
    hint: db ? null : (error ?? "Falha ao conectar no MongoDB."),
  });
}
