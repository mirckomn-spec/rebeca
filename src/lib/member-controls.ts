import { getDbRequired } from "@/lib/mongodb";

export type MemberControlDoc = {
  username: string;
  balanceAdjustment: number;
  dailyProgressOverride: number | null;
  streakOverride: number | null;
  /** Compat legado: era comissao unica. */
  commissionPercentOverride: number | null;
  /** Comissao base/global (aplicada sem bater meta). */
  globalCommissionPercentOverride: number | null;
  /** Comissao aplicada quando bate a meta diaria. */
  goalReachedCommissionPercentOverride: number | null;
  updatedAt: string;
  updatedBy: string;
};

export const DEFAULT_GLOBAL_COMMISSION_PERCENT = 35;
export const DEFAULT_GOAL_REACHED_COMMISSION_PERCENT = 40;

export function resolveCommissionPercents(control?: Partial<MemberControlDoc> | null) {
  const legacy = control?.commissionPercentOverride;
  const global =
    control?.globalCommissionPercentOverride != null
      ? Number(control.globalCommissionPercentOverride)
      : legacy != null
        ? Number(legacy)
        : DEFAULT_GLOBAL_COMMISSION_PERCENT;
  const goalReached =
    control?.goalReachedCommissionPercentOverride != null
      ? Number(control.goalReachedCommissionPercentOverride)
      : legacy != null
        ? Number(legacy)
        : DEFAULT_GOAL_REACHED_COMMISSION_PERCENT;
  return {
    global: Math.min(100, Math.max(0, global)),
    goalReached: Math.min(100, Math.max(0, goalReached)),
  };
}

export async function getAllMemberControls() {
  const db = await getDbRequired();
  const rows = await db.collection("member_controls").find({}).toArray();
  return rows.map((row) => ({
    username: String(row.username ?? "").toLowerCase(),
    balanceAdjustment: Number(row.balanceAdjustment ?? 0),
    dailyProgressOverride:
      row.dailyProgressOverride == null ? null : Number(row.dailyProgressOverride),
    streakOverride: row.streakOverride == null ? null : Number(row.streakOverride),
    commissionPercentOverride:
      row.commissionPercentOverride == null ? null : Number(row.commissionPercentOverride),
    globalCommissionPercentOverride:
      row.globalCommissionPercentOverride == null
        ? null
        : Number(row.globalCommissionPercentOverride),
    goalReachedCommissionPercentOverride:
      row.goalReachedCommissionPercentOverride == null
        ? null
        : Number(row.goalReachedCommissionPercentOverride),
    updatedAt: new Date(row.updatedAt ?? new Date()).toISOString(),
    updatedBy: String(row.updatedBy ?? "system"),
  }));
}

export async function upsertMemberControl(
  username: string,
  patch: Partial<Omit<MemberControlDoc, "username" | "updatedAt" | "updatedBy">>,
  updatedBy: string,
) {
  const normalized = username.toLowerCase().trim();
  const db = await getDbRequired();

  await db.collection("member_controls").updateOne(
    { username: normalized },
    {
      $set: {
        username: normalized,
        ...patch,
        updatedAt: new Date(),
        updatedBy,
      },
      $setOnInsert: {
        balanceAdjustment: 0,
        dailyProgressOverride: null,
        streakOverride: null,
        commissionPercentOverride: null,
        globalCommissionPercentOverride: null,
        goalReachedCommissionPercentOverride: null,
      },
    },
    { upsert: true },
  );

  const row = await db.collection("member_controls").findOne({ username: normalized });
  return {
    username: normalized,
    balanceAdjustment: Number(row?.balanceAdjustment ?? 0),
    dailyProgressOverride:
      row?.dailyProgressOverride == null ? null : Number(row.dailyProgressOverride),
    streakOverride: row?.streakOverride == null ? null : Number(row.streakOverride),
    commissionPercentOverride:
      row?.commissionPercentOverride == null ? null : Number(row.commissionPercentOverride),
    globalCommissionPercentOverride:
      row?.globalCommissionPercentOverride == null
        ? null
        : Number(row.globalCommissionPercentOverride),
    goalReachedCommissionPercentOverride:
      row?.goalReachedCommissionPercentOverride == null
        ? null
        : Number(row.goalReachedCommissionPercentOverride),
    updatedAt: new Date(row?.updatedAt ?? new Date()).toISOString(),
    updatedBy: String(row?.updatedBy ?? updatedBy),
  } as MemberControlDoc;
}
