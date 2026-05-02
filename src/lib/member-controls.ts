import { getDbRequired } from "@/lib/mongodb";

export type MemberControlDoc = {
  username: string;
  balanceAdjustment: number;
  dailyProgressOverride: number | null;
  streakOverride: number | null;
  commissionPercentOverride: number | null;
  updatedAt: string;
  updatedBy: string;
};

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
    updatedAt: new Date(row?.updatedAt ?? new Date()).toISOString(),
    updatedBy: String(row?.updatedBy ?? updatedBy),
  } as MemberControlDoc;
}
