import "server-only";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { Db } from "mongodb";
import { getDbRequired, getDbSafe } from "@/lib/mongodb";
import { ALLOWED_USERS } from "@/lib/users";

export type SiteUserDoc = {
  username: string;
  passwordHash: string;
  passwordPlain?: string | null;
  role: "member";
  blocked: boolean;
  blockedReason: string | null;
  deleted: boolean;
  createdAt: Date;
};

const COLLECTION = "site_users";
/** Usuarios apagados definitivamente (nao voltam na lista nem no login legado). */
const REMOVED_COLLECTION = "removed_site_users";

export async function getPermanentlyRemovedUsernameSet(db: Db): Promise<Set<string>> {
  const rows = await db.collection(REMOVED_COLLECTION).find({}).project({ username: 1 }).toArray();
  return new Set(
    rows.map((r) => String(r.username ?? "").toLowerCase()).filter((u) => u && u !== "bel"),
  );
}

export async function isPermanentlyRemoved(username: string): Promise<boolean> {
  const { db } = await getDbSafe();
  if (!db) return false;
  const normalized = username.toLowerCase();
  const doc = await db
    .collection(REMOVED_COLLECTION)
    .findOne({ username: normalized }, { projection: { _id: 1 } });
  return Boolean(doc);
}

async function purgeRankingOverrideForUser(db: Db, username: string) {
  const row = (await db.collection("settings").findOne({ key: "ranking" })) as {
    valueOverridesByUser?: Record<string, number>;
    valueAdjustmentsByUser?: Record<string, number>;
  } | null;
  if (!row) return;
  const vo = { ...(row.valueOverridesByUser ?? {}) };
  const va = { ...(row.valueAdjustmentsByUser ?? {}) };
  let changed = false;
  for (const key of Object.keys(vo)) {
    if (key.toLowerCase() === username) {
      delete vo[key];
      changed = true;
    }
  }
  for (const key of Object.keys(va)) {
    if (key.toLowerCase() === username) {
      delete va[key];
      changed = true;
    }
  }
  if (changed) {
    await db.collection("settings").updateOne(
      { key: "ranking" },
      { $set: { valueOverridesByUser: vo, valueAdjustmentsByUser: va } },
    );
  }
}

async function purgeMemberFromSite(db: Db, normalized: string, removedBy: string) {
  await db.collection(REMOVED_COLLECTION).updateOne(
    { username: normalized },
    {
      $set: {
        username: normalized,
        removedAt: new Date(),
        removedBy,
      },
    },
    { upsert: true },
  );

  await Promise.all([
    db.collection(COLLECTION).deleteOne({ username: normalized }),
    db.collection("proofs").deleteMany({
      $or: [{ uploader: normalized }, { sellerName: normalized }],
    }),
    db.collection("fines").deleteMany({ username: normalized }),
    db.collection("member_controls").deleteOne({ username: normalized }),
    db.collection("profiles").deleteOne({ username: normalized }),
    db.collection("hots_access").deleteMany({ username: normalized }),
    db.collection("withdrawals").deleteMany({ username: normalized }),
  ]);

  await purgeRankingOverrideForUser(db, normalized);
}

export async function findSiteUser(username: string) {
  const { db } = await getDbSafe();
  const normalized = username.toLowerCase();
  if (!db) {
    return null;
  }
  const removed = await db
    .collection(REMOVED_COLLECTION)
    .findOne({ username: normalized }, { projection: { _id: 1 } });
  if (removed) {
    return null;
  }
  return db.collection(COLLECTION).findOne<SiteUserDoc>({ username: normalized });
}

export function generateRandomPassword() {
  return randomBytes(9).toString("base64url").slice(0, 12);
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function listSiteUsersForAdmin() {
  const db = await getDbRequired();
  const rows = await db
    .collection(COLLECTION)
    .find({ deleted: { $ne: true } })
    .sort({ username: 1 })
    .toArray();
  return rows.map((row) => ({
    username: String(row.username ?? ""),
    blocked: Boolean(row.blocked),
    blockedReason: row.blockedReason ? String(row.blockedReason) : null,
    deleted: Boolean(row.deleted),
    createdAt: row.createdAt,
  }));
}

export async function createSiteUser(username: string, plainPassword: string) {
  const db = await getDbRequired();
  const normalized = username.toLowerCase().trim();
  if (!normalized || normalized === "bel") {
    throw new Error("Usuario invalido.");
  }
  await db.collection(REMOVED_COLLECTION).deleteOne({ username: normalized });

  const passwordHash = await hashPassword(plainPassword);
  const existing = await db.collection(COLLECTION).findOne({ username: normalized });
  if (existing && !existing.deleted) {
    throw new Error("Usuario ja existe.");
  }
  await db.collection(COLLECTION).updateOne(
    { username: normalized },
    {
      $set: {
        username: normalized,
        passwordHash,
        passwordPlain: plainPassword,
        role: "member" as const,
        blocked: false,
        blockedReason: null,
        deleted: false,
        createdAt: existing?.createdAt ?? new Date(),
      },
    },
    { upsert: true },
  );
}

export async function getSiteUserPlainPassword(username: string): Promise<string | null> {
  const normalized = username.toLowerCase().trim();
  if (!normalized) return null;
  const { db } = await getDbSafe();
  if (db) {
    const doc = await db
      .collection(COLLECTION)
      .findOne<SiteUserDoc>({ username: normalized });
    if (doc?.passwordPlain) return String(doc.passwordPlain);
  }
  const legacy = ALLOWED_USERS[normalized];
  return legacy ?? null;
}

export async function setUserBlocked(
  username: string,
  blocked: boolean,
  blockedReason: string | null,
) {
  const db = await getDbRequired();
  const normalized = username.toLowerCase().trim();
  if (normalized === "bel") throw new Error("Nao e possivel bloquear a conta da Bel.");
  const existing = await db.collection(COLLECTION).findOne({ username: normalized });
  if (!existing) {
    const legacyPlain = ALLOWED_USERS[normalized];
    const fallbackPlain = legacyPlain ?? generateRandomPassword();
    const passwordHash = await hashPassword(fallbackPlain);
    await db.collection(COLLECTION).insertOne({
      username: normalized,
      passwordHash,
      passwordPlain: fallbackPlain,
      role: "member" as const,
      blocked,
      blockedReason: blocked ? (blockedReason?.trim() || "Sem motivo informado.") : null,
      deleted: false,
      createdAt: new Date(),
    });
    return;
  }
  await db.collection(COLLECTION).updateOne(
    { username: normalized },
    {
      $set: {
        blocked,
        blockedReason: blocked ? (blockedReason?.trim() || "Sem motivo informado.") : null,
      },
    },
  );
}

export async function setUserDeleted(
  username: string,
  hard: boolean,
  options?: { removedBy?: string },
) {
  const db = await getDbRequired();
  const normalized = username.toLowerCase().trim();
  if (normalized === "bel") throw new Error("Nao e possivel remover a conta da Bel.");
  if (hard) {
    await purgeMemberFromSite(db, normalized, options?.removedBy ?? "admin");
    return;
  }
  const existing = await db.collection(COLLECTION).findOne({ username: normalized });
  if (!existing) {
    const legacyPlain = ALLOWED_USERS[normalized];
    const fallbackPlain = legacyPlain ?? generateRandomPassword();
    const passwordHash = await hashPassword(fallbackPlain);
    await db.collection(COLLECTION).insertOne({
      username: normalized,
      passwordHash,
      passwordPlain: fallbackPlain,
      role: "member" as const,
      blocked: true,
      blockedReason: "Conta encerrada.",
      deleted: true,
      createdAt: new Date(),
    });
    return;
  }
  await db.collection(COLLECTION).updateOne(
    { username: normalized },
    {
      $set: {
        deleted: true,
        blocked: true,
        blockedReason: "Conta encerrada.",
      },
    },
  );
}
