import type { Db } from "mongodb";

const REFERRAL_CODES_COLLECTION = "referral_codes";
const REFERRALS_COLLECTION = "referrals";
const REFERRAL_BONUS_PERCENT = 4;

type ReferralCodeDoc = {
  username: string;
  code: string;
  createdAt: Date;
};

type ReferralLinkDoc = {
  inviterUsername: string;
  inviteeUsername: string;
  codeUsed: string;
  linkedAt: Date;
};

function makeCandidateCode(username: string) {
  const prefix = username.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6) || "HOTS";
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${suffix}`;
}

export async function getOrCreateReferralCode(db: Db, username: string): Promise<string> {
  const normalized = username.toLowerCase();
  const existing = await db
    .collection(REFERRAL_CODES_COLLECTION)
    .findOne<ReferralCodeDoc>({ username: normalized });
  if (existing?.code) return String(existing.code).toUpperCase();

  for (let i = 0; i < 10; i += 1) {
    const code = makeCandidateCode(normalized);
    try {
      await db.collection(REFERRAL_CODES_COLLECTION).insertOne({
        username: normalized,
        code,
        createdAt: new Date(),
      });
      return code;
    } catch {
      // colisao rara de codigo; tenta novamente.
    }
  }
  throw new Error("Nao foi possivel gerar um codigo de indicacao unico.");
}

export async function applyReferralCodeForUser(
  db: Db,
  inviteeUsername: string,
  rawCode: string,
) {
  const invitee = inviteeUsername.toLowerCase();
  const code = rawCode.trim().toUpperCase();
  if (!code) throw new Error("Informe um codigo de indicacao.");

  const owner = await db
    .collection(REFERRAL_CODES_COLLECTION)
    .findOne<ReferralCodeDoc>({ code });
  if (!owner) throw new Error("Codigo de indicacao invalido.");

  const inviter = String(owner.username ?? "").toLowerCase();
  if (!inviter || inviter === "bel") throw new Error("Codigo de indicacao invalido.");
  if (inviter === invitee) throw new Error("Voce nao pode usar o proprio codigo.");

  const alreadyLinkedAsInvitee = await db
    .collection(REFERRALS_COLLECTION)
    .findOne<ReferralLinkDoc>({ inviteeUsername: invitee });
  if (alreadyLinkedAsInvitee) {
    throw new Error("Voce ja esta vinculado a um codigo de indicacao.");
  }

  await db.collection(REFERRALS_COLLECTION).insertOne({
    inviterUsername: inviter,
    inviteeUsername: invitee,
    codeUsed: code,
    linkedAt: new Date(),
  });

  return { inviterUsername: inviter, codeUsed: code };
}

export async function getInviteesByInviter(db: Db, inviterUsername: string) {
  const inviter = inviterUsername.toLowerCase();
  const rows = await db
    .collection(REFERRALS_COLLECTION)
    .find<ReferralLinkDoc>({ inviterUsername: inviter })
    .sort({ linkedAt: -1 })
    .toArray();
  return rows.map((row) => ({
    inviteeUsername: String(row.inviteeUsername ?? "").toLowerCase(),
    codeUsed: String(row.codeUsed ?? ""),
    linkedAt: new Date(row.linkedAt ?? new Date()).toISOString(),
  }));
}

export async function getReferralLinkForInvitee(db: Db, inviteeUsername: string) {
  const invitee = inviteeUsername.toLowerCase();
  const row = await db
    .collection(REFERRALS_COLLECTION)
    .findOne<ReferralLinkDoc>({ inviteeUsername: invitee });
  if (!row) return null;
  return {
    inviterUsername: String(row.inviterUsername ?? "").toLowerCase(),
    codeUsed: String(row.codeUsed ?? "").toUpperCase(),
    linkedAt: new Date(row.linkedAt ?? new Date()).toISOString(),
  };
}

export function getReferralBonusPercent() {
  return REFERRAL_BONUS_PERCENT;
}
