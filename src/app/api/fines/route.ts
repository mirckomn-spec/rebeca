import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSessionFromCookie } from "@/lib/auth";
import { getDbRequired, MongoUnavailableError } from "@/lib/mongodb";

function parseDuration(type: string, amountRaw: string | null) {
  if (type === "eterno") return null;
  const amount = Number.parseInt(amountRaw ?? "0", 10);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (type === "dias") return amount * 24 * 60 * 60 * 1000;
  if (type === "segundos") return amount * 1000;
  return null;
}

function mongo503(e: unknown) {
  if (e instanceof MongoUnavailableError) {
    return NextResponse.json(
      { error: "Servico temporariamente indisponivel. Tente novamente em instantes." },
      { status: 503 },
    );
  }
  return null;
}

export async function GET(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const target = searchParams.get("username")?.toLowerCase();
  const all = session.role === "admin" && searchParams.get("all") === "1";
  const username = session.role === "admin" && target ? target : session.username;

  try {
    const db = await getDbRequired();
    const fines = await db
      .collection("fines")
      .find(all ? {} : { username })
      .sort({ createdAt: -1 })
      .toArray();

    const dbItems = fines.map((fine) => ({
      id: String(fine._id),
      username: fine.username,
      reason: fine.reason,
      durationType: fine.durationType,
      durationValue: fine.durationValue ?? null,
      penaltyPercent: fine.penaltyPercent ?? null,
      expiresAt: fine.expiresAt ?? null,
      createdAt: fine.createdAt,
      createdBy: fine.createdBy ?? "bel",
    }));

    return NextResponse.json(
      dbItems.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    );
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }
}

export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const { username, reason, durationType, durationValue, penaltyPercent } =
    await request.json();
  const normalizedUsername = String(username ?? "").toLowerCase().trim();
  const normalizedReason = String(reason ?? "").trim();
  const normalizedType = String(durationType ?? "").trim().toLowerCase();

  if (!normalizedUsername || normalizedUsername === "bel" || !normalizedReason) {
    return NextResponse.json({ error: "Informe usuario e motivo validos." }, { status: 400 });
  }

  if (!["eterno", "dias", "segundos"].includes(normalizedType)) {
    return NextResponse.json({ error: "Tipo de duracao invalido." }, { status: 400 });
  }

  const normalizedPenalty = Number.parseFloat(String(penaltyPercent ?? "0"));
  if (
    !Number.isFinite(normalizedPenalty) ||
    normalizedPenalty < 0 ||
    normalizedPenalty > 100
  ) {
    return NextResponse.json(
      { error: "Percentual da multa deve estar entre 0 e 100." },
      { status: 400 },
    );
  }

  const durationMs = parseDuration(normalizedType, String(durationValue ?? ""));
  if (normalizedType !== "eterno" && durationMs === null) {
    return NextResponse.json({ error: "Duracao invalida." }, { status: 400 });
  }

  const now = new Date();
  const expiresAt =
    normalizedType === "eterno" || durationMs === null
      ? null
      : new Date(now.getTime() + durationMs);

  try {
    const db = await getDbRequired();
    const result = await db.collection("fines").insertOne({
      username: normalizedUsername,
      reason: normalizedReason,
      durationType: normalizedType,
      durationValue:
        normalizedType === "eterno" ? null : Number.parseInt(String(durationValue ?? "0"), 10),
      penaltyPercent: normalizedPenalty,
      expiresAt,
      createdAt: now,
      createdBy: session.username,
    });

    return NextResponse.json({ ok: true, id: String(result.insertedId) });
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }
}

export async function DELETE(request: Request) {
  const session = await getSessionFromCookie();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const { id, username } = await request.json();
  const fineId = String(id ?? "").trim();
  const normalizedUsername = String(username ?? "").toLowerCase().trim();

  if (!fineId) {
    return NextResponse.json({ error: "Informe o id da multa." }, { status: 400 });
  }

  try {
    const db = await getDbRequired();

    if (!ObjectId.isValid(fineId)) {
      return NextResponse.json({ error: "Multa nao encontrada." }, { status: 404 });
    }

    const filter: Record<string, unknown> = { _id: new ObjectId(fineId) };
    if (normalizedUsername) {
      filter.username = normalizedUsername;
    }

    const result = await db.collection("fines").deleteOne(filter);
    if (!result.deletedCount) {
      return NextResponse.json({ error: "Multa nao encontrada." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, storage: "mongodb" });
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }
}

export async function PATCH(request: Request) {
  const session = await getSessionFromCookie();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        id?: string;
        durationType?: "eterno" | "dias" | "segundos";
        durationValue?: number | null;
        penaltyPercent?: number | null;
      }
    | null;
  const fineId = String(body?.id ?? "").trim();
  if (!fineId) {
    return NextResponse.json({ error: "Informe o id da multa." }, { status: 400 });
  }

  const now = new Date();
  const patch: Record<string, unknown> = {};
  if (body?.durationType) {
    const normalizedType = String(body.durationType).toLowerCase();
    if (!["eterno", "dias", "segundos"].includes(normalizedType)) {
      return NextResponse.json({ error: "Tipo de duracao invalido." }, { status: 400 });
    }
    patch.durationType = normalizedType;
    const durationMs = parseDuration(normalizedType, String(body.durationValue ?? ""));
    if (normalizedType !== "eterno" && durationMs === null) {
      return NextResponse.json({ error: "Duracao invalida." }, { status: 400 });
    }
    patch.durationValue = normalizedType === "eterno" ? null : Number(body.durationValue ?? 0);
    patch.expiresAt =
      normalizedType === "eterno" || durationMs === null ? null : new Date(now.getTime() + durationMs);
  }
  if (body?.penaltyPercent != null) {
    const normalizedPenalty = Number(body.penaltyPercent);
    if (!Number.isFinite(normalizedPenalty) || normalizedPenalty < 0 || normalizedPenalty > 100) {
      return NextResponse.json(
        { error: "Percentual da multa deve estar entre 0 e 100." },
        { status: 400 },
      );
    }
    patch.penaltyPercent = normalizedPenalty;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nenhuma alteracao enviada." }, { status: 400 });
  }

  try {
    const db = await getDbRequired();
    if (!ObjectId.isValid(fineId)) {
      return NextResponse.json({ error: "Multa nao encontrada." }, { status: 404 });
    }
    const result = await db.collection("fines").updateOne(
      { _id: new ObjectId(fineId) },
      { $set: patch },
    );
    if (!result.matchedCount) {
      return NextResponse.json({ error: "Multa nao encontrada." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, storage: "mongodb" });
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }
}
