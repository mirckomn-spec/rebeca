import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { getDbRequired, MongoUnavailableError } from "@/lib/mongodb";

const DEFAULT_MIN_WITHDRAW = 200;

function mongo503(e: unknown) {
  if (e instanceof MongoUnavailableError) {
    return NextResponse.json(
      { error: "Servico temporariamente indisponivel. Tente novamente em instantes." },
      { status: 503 },
    );
  }
  return null;
}

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });

  try {
    const db = await getDbRequired();
    const settings = await db
      .collection("settings")
      .findOne<{ minWithdraw?: unknown }>({ key: "withdrawals" });
    return NextResponse.json({
      minWithdraw: Number(settings?.minWithdraw ?? DEFAULT_MIN_WITHDRAW),
    });
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }
}

export async function PATCH(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Somente admin pode alterar o minimo." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { minWithdraw?: number } | null;
  const minWithdraw = Number(body?.minWithdraw);
  if (!Number.isFinite(minWithdraw) || minWithdraw < 0) {
    return NextResponse.json({ error: "Valor minimo invalido." }, { status: 400 });
  }

  const normalized = Number(minWithdraw.toFixed(2));

  try {
    const db = await getDbRequired();
    await db.collection("settings").updateOne(
      { key: "withdrawals" },
      {
        $set: {
          key: "withdrawals",
          minWithdraw: normalized,
          updatedAt: new Date(),
          updatedBy: session.username,
        },
      },
      { upsert: true },
    );
    return NextResponse.json({ ok: true, minWithdraw: normalized });
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }
}
