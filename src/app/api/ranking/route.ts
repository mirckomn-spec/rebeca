import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { getDbRequired, MongoUnavailableError } from "@/lib/mongodb";
import { listMemberUsernames } from "@/lib/members";

type ProofDoc = {
  uploader?: string;
  createdAt: string | Date;
  saleValue?: number;
};

type RankingSettings = {
  prizes: Record<"d1" | "d7" | "d14" | "d31", number>;
  valueOverridesByUser: Record<string, number>;
  resetAt: string | null;
};

const DEFAULT_PRIZES: RankingSettings["prizes"] = {
  d1: 0,
  d7: 0,
  d14: 0,
  d31: 150,
};

function rankByUploader(
  proofs: ProofDoc[],
  since: Date,
  members: string[],
  valueOverridesByUser: Record<string, number>,
  resetAt: string | null,
) {
  const map = new Map<string, { vendas: number; valorTotal: number }>();
  for (const member of members) {
    map.set(member, { vendas: 0, valorTotal: 0 });
  }
  for (const proof of proofs) {
    const created = new Date(proof.createdAt);
    if (created < since) continue;
    if (resetAt && created < new Date(resetAt)) continue;
    const user = String(proof.uploader ?? "").toLowerCase();
    if (!user || user === "bel") continue;
    const current = map.get(user) ?? { vendas: 0, valorTotal: 0 };
    current.vendas += 1;
    current.valorTotal += Number(proof.saleValue ?? 0);
    map.set(user, current);
  }
  return Array.from(map.entries())
    .map(([username, stats]) => ({
      username,
      vendas: stats.vendas,
      valorTotal:
        valueOverridesByUser[username] != null
          ? Number(Number(valueOverridesByUser[username]).toFixed(2))
          : Number(stats.valorTotal.toFixed(2)),
    }))
    .sort((a, b) => b.valorTotal - a.valorTotal || b.vendas - a.vendas);
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

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  try {
    const db = await getDbRequired();
    const proofs = (await db.collection("proofs").find({}).toArray()) as unknown as ProofDoc[];

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const members = await listMemberUsernames();
    const settings = (await db.collection("settings").findOne({ key: "ranking" })) as
      | {
          prizes?: Partial<RankingSettings["prizes"]>;
          valueOverridesByUser?: Record<string, number>;
          valueAdjustmentsByUser?: Record<string, number>;
          resetAt?: string | null;
        }
      | null;

    const prizes: RankingSettings["prizes"] = {
      d1: Number(settings?.prizes?.d1 ?? DEFAULT_PRIZES.d1),
      d7: Number(settings?.prizes?.d7 ?? DEFAULT_PRIZES.d7),
      d14: Number(settings?.prizes?.d14 ?? DEFAULT_PRIZES.d14),
      d31: Number(settings?.prizes?.d31 ?? DEFAULT_PRIZES.d31),
    };
    const valueOverridesByUser = Object.fromEntries(
      Object.entries(
        settings?.valueOverridesByUser ??
          (settings as { valueAdjustmentsByUser?: Record<string, number> } | null)
            ?.valueAdjustmentsByUser ??
          {},
      ).map(([k, v]) => [
        String(k).toLowerCase(),
        Number(v ?? 0),
      ]),
    );
    const resetAt = typeof settings?.resetAt === "string" ? settings.resetAt : null;

    const windows = {
      d1: rankByUploader(proofs, new Date(now - dayMs), members, valueOverridesByUser, resetAt),
      d7: rankByUploader(proofs, new Date(now - 7 * dayMs), members, valueOverridesByUser, resetAt),
      d14: rankByUploader(proofs, new Date(now - 14 * dayMs), members, valueOverridesByUser, resetAt),
      d31: rankByUploader(proofs, new Date(now - 31 * dayMs), members, valueOverridesByUser, resetAt),
    };

    return NextResponse.json({
      ...windows,
      prizes,
      valueOverridesByUser,
      resetAt,
      storage: "mongodb",
      warning: null as string | null,
    });
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
        username?: string;
        valueOverride?: number;
        prizeWindow?: "d1" | "d7" | "d14" | "d31";
        prizeValue?: number;
        resetRanking?: boolean;
      }
    | null;

  try {
    const db = await getDbRequired();
    const row = (await db.collection("settings").findOne({ key: "ranking" })) as
      | {
          prizes?: Partial<RankingSettings["prizes"]>;
          valueOverridesByUser?: Record<string, number>;
          valueAdjustmentsByUser?: Record<string, number>;
          resetAt?: string | null;
        }
      | null;
    const settings: RankingSettings = {
      prizes: {
        d1: Number(row?.prizes?.d1 ?? DEFAULT_PRIZES.d1),
        d7: Number(row?.prizes?.d7 ?? DEFAULT_PRIZES.d7),
        d14: Number(row?.prizes?.d14 ?? DEFAULT_PRIZES.d14),
        d31: Number(row?.prizes?.d31 ?? DEFAULT_PRIZES.d31),
      },
      valueOverridesByUser: Object.fromEntries(
        Object.entries(
          row?.valueOverridesByUser ?? row?.valueAdjustmentsByUser ?? {},
        ).map(([k, v]) => [
          String(k).toLowerCase(),
          Number(v ?? 0),
        ]),
      ),
      resetAt: typeof row?.resetAt === "string" ? row.resetAt : null,
    };

    if (body?.username && body?.valueOverride != null) {
      const username = String(body.username).trim().toLowerCase();
      settings.valueOverridesByUser[username] = Number(body.valueOverride ?? 0);
    }
    if (body?.prizeWindow && body?.prizeValue != null) {
      settings.prizes[body.prizeWindow] = Number(body.prizeValue ?? 0);
    }
    if (body?.resetRanking) {
      settings.valueOverridesByUser = {};
      settings.resetAt = new Date().toISOString();
    }

    await db.collection("settings").updateOne(
      { key: "ranking" },
      {
        $set: {
          key: "ranking",
          prizes: settings.prizes,
          valueOverridesByUser: settings.valueOverridesByUser,
          resetAt: settings.resetAt,
          updatedAt: new Date(),
          updatedBy: session.username,
        },
      },
      { upsert: true },
    );
    return NextResponse.json({ ok: true, settings });
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }
}
