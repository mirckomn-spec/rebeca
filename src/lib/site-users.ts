import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { getDbRequired, getDbSafe } from "@/lib/mongodb";
import { ALLOWED_USERS } from "@/lib/users";

export type SiteUserDoc = {
  username: string;
  passwordHash: string;
  role: "member";
  blocked: boolean;
  blockedReason: string | null;
  deleted: boolean;
  createdAt: Date;
};

const COLLECTION = "site_users";

export async function findSiteUser(username: string) {
  const { db } = await getDbSafe();
  const normalized = username.toLowerCase();
  if (!db) {
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
    .find({})
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
    const passwordHash = legacyPlain
      ? await hashPassword(legacyPlain)
      : await hashPassword(generateRandomPassword());
    await db.collection(COLLECTION).insertOne({
      username: normalized,
      passwordHash,
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

export async function setUserDeleted(username: string, hard: boolean) {
  const db = await getDbRequired();
  const normalized = username.toLowerCase().trim();
  if (normalized === "bel") throw new Error("Nao e possivel remover a conta da Bel.");
  if (hard) {
    await db.collection(COLLECTION).deleteOne({ username: normalized });
    return;
  }
  const existing = await db.collection(COLLECTION).findOne({ username: normalized });
  if (!existing) {
    const legacyPlain = ALLOWED_USERS[normalized];
    const passwordHash = legacyPlain
      ? await hashPassword(legacyPlain)
      : await hashPassword(generateRandomPassword());
    await db.collection(COLLECTION).insertOne({
      username: normalized,
      passwordHash,
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
