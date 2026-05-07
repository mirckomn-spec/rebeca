import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { getDbRequired, MongoUnavailableError } from "@/lib/mongodb";
import { listMemberUsernames } from "@/lib/members";
import {
  getAllMemberControls,
  upsertMemberControl,
  resolveCommissionPercents,
  DEFAULT_GLOBAL_COMMISSION_PERCENT,
} from "@/lib/member-controls";

const DAILY_TARGET = 150;

type ProofDoc = {
  uploader?: string;
  saleValue?: number;
  createdAt: string | Date;
};

function mongo503(e: unknown) {
  if (e instanceof MongoUnavailableError) {
    return NextResponse.json(
      { error: "Banco de dados indisponivel.", details: e.message },
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
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const proofsToday = (await db
      .collection("proofs")
      .find({ createdAt: { $gte: start } })
      .toArray()) as unknown as ProofDoc[];
    const allProofs = (await db.collection("proofs").find({}).toArray()) as unknown as ProofDoc[];

    const totalsMap = new Map<string, number>();
    for (const proof of proofsToday) {
      const user = String(proof.uploader ?? "").toLowerCase();
      if (!user || user === "bel") continue;
      const value = Number(proof.saleValue ?? 0);
      totalsMap.set(user, (totalsMap.get(user) ?? 0) + value);
    }

    const dailyTotalsByUser = new Map<string, Map<string, number>>();
    for (const proof of allProofs) {
      const user = String(proof.uploader ?? "").toLowerCase();
      if (!user || user === "bel") continue;
      const proofDate = new Date(proof.createdAt);
      if (Number.isNaN(proofDate.getTime())) continue;
      const dayKey = proofDate.toISOString().slice(0, 10);
      const value = Number(proof.saleValue ?? 0);
      if (!dailyTotalsByUser.has(user)) {
        dailyTotalsByUser.set(user, new Map<string, number>());
      }
      const userDays = dailyTotalsByUser.get(user)!;
      userDays.set(dayKey, (userDays.get(dayKey) ?? 0) + value);
    }

    function computeStreakDays(username: string) {
      const userDays = dailyTotalsByUser.get(username) ?? new Map<string, number>();
      const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayKey = cursor.toISOString().slice(0, 10);
      const hitToday = (userDays.get(todayKey) ?? 0) >= DAILY_TARGET;
      if (!hitToday) return 0;
      let streak = 0;
      while (true) {
        const dayKey = cursor.toISOString().slice(0, 10);
        const total = userDays.get(dayKey) ?? 0;
        if (total < DAILY_TARGET) break;
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
      return streak;
    }

    const members = await listMemberUsernames();
    const controls = await getAllMemberControls();
    const controlsMap = new Map(controls.map((item) => [item.username, item]));
    const allUsers = members
      .map((username) => {
        const control = controlsMap.get(username);
        const totalBase = totalsMap.get(username) ?? 0;
        const total =
          control?.dailyProgressOverride != null
            ? Number(control.dailyProgressOverride)
            : totalBase;
        const progress = Math.min(100, Number(((total / DAILY_TARGET) * 100).toFixed(2)));
        const streakDays =
          control?.streakOverride != null
            ? Math.max(0, Number(control.streakOverride))
            : computeStreakDays(username);
        const bonusActive = progress >= 100;
        const commissions = resolveCommissionPercents(control);
        const commissionPercent = bonusActive ? commissions.goalReached : commissions.global;
        return {
          username,
          total: Number(total.toFixed(2)),
          target: DAILY_TARGET,
          progress,
          streakDays,
          bonusActive,
          commissionPercent,
          globalCommissionPercent: commissions.global,
          goalReachedCommissionPercent: commissions.goalReached,
        };
      })
      .sort((a, b) => b.total - a.total);

    const current = allUsers.find((item) => item.username === session.username) ?? {
      username: session.username,
      total: 0,
      target: DAILY_TARGET,
      progress: 0,
      streakDays: 0,
      bonusActive: false,
      commissionPercent: DEFAULT_GLOBAL_COMMISSION_PERCENT,
      globalCommissionPercent: DEFAULT_GLOBAL_COMMISSION_PERCENT,
      goalReachedCommissionPercent: 40,
    };

    return NextResponse.json({
      dailyTarget: DAILY_TARGET,
      current,
      users: allUsers,
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
        dailyProgressOverride?: number | null;
        streakOverride?: number | null;
        commissionPercentOverride?: number | null;
        globalCommissionPercentOverride?: number | null;
        goalReachedCommissionPercentOverride?: number | null;
        balanceAdjustmentDelta?: number;
      }
    | null;

  const username = String(body?.username ?? "").trim().toLowerCase();
  if (!username || username === "bel") {
    return NextResponse.json({ error: "Usuario invalido." }, { status: 400 });
  }

  try {
    const controls = await getAllMemberControls();
    const current = controls.find((item) => item.username === username) ?? {
      username,
      balanceAdjustment: 0,
      dailyProgressOverride: null,
      streakOverride: null,
      commissionPercentOverride: null,
      globalCommissionPercentOverride: null,
      goalReachedCommissionPercentOverride: null,
      updatedAt: new Date().toISOString(),
      updatedBy: session.username,
    };

    const patch: {
      balanceAdjustment?: number;
      dailyProgressOverride?: number | null;
      streakOverride?: number | null;
      commissionPercentOverride?: number | null;
      globalCommissionPercentOverride?: number | null;
      goalReachedCommissionPercentOverride?: number | null;
    } = {};

    if (body?.balanceAdjustmentDelta != null) {
      const delta = Number(body.balanceAdjustmentDelta);
      if (!Number.isFinite(delta)) {
        return NextResponse.json({ error: "Ajuste de saldo invalido." }, { status: 400 });
      }
      patch.balanceAdjustment = Number((current.balanceAdjustment + delta).toFixed(2));
    }
    if (Object.prototype.hasOwnProperty.call(body ?? {}, "dailyProgressOverride")) {
      const v = body?.dailyProgressOverride;
      patch.dailyProgressOverride = v == null ? null : Math.max(0, Number(v));
    }
    if (Object.prototype.hasOwnProperty.call(body ?? {}, "streakOverride")) {
      const v = body?.streakOverride;
      patch.streakOverride = v == null ? null : Math.max(0, Math.floor(Number(v)));
    }
    if (Object.prototype.hasOwnProperty.call(body ?? {}, "commissionPercentOverride")) {
      const v = body?.commissionPercentOverride;
      patch.commissionPercentOverride =
        v == null ? null : Math.min(100, Math.max(0, Number(v)));
    }
    if (Object.prototype.hasOwnProperty.call(body ?? {}, "globalCommissionPercentOverride")) {
      const v = body?.globalCommissionPercentOverride;
      patch.globalCommissionPercentOverride =
        v == null ? null : Math.min(100, Math.max(0, Number(v)));
    }
    if (
      Object.prototype.hasOwnProperty.call(body ?? {}, "goalReachedCommissionPercentOverride")
    ) {
      const v = body?.goalReachedCommissionPercentOverride;
      patch.goalReachedCommissionPercentOverride =
        v == null ? null : Math.min(100, Math.max(0, Number(v)));
    }

    const saved = await upsertMemberControl(username, patch, session.username);
    return NextResponse.json({ ok: true, control: saved });
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }
}
