import "server-only";
import type { Db } from "mongodb";
import { resolveCommissionPercents } from "@/lib/member-controls";
import { getInviteesByInviter, getReferralBonusPercent } from "@/lib/referrals";

const DAILY_TARGET = 150;

type ProofDoc = {
  uploader?: string;
  saleValue?: number;
  createdAt: string | Date;
};

type WithdrawalDoc = {
  username: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
};

export type WalletSnapshot = {
  commissionPercent: number;
  balanceAdjustment: number;
  referralBonusAmount: number;
  approvedTotal: number;
  grossReal: number;
  available: number;
};

function dayKey(dateInput: string | Date) {
  return new Date(dateInput).toISOString().slice(0, 10);
}

export function computeTodayCommissionPercentForUser(
  username: string,
  proofs: ProofDoc[],
  options?: {
    globalCommissionPercentOverride?: number | null;
    goalReachedCommissionPercentOverride?: number | null;
    legacyCommissionPercentOverride?: number | null;
  },
) {
  const commissions = resolveCommissionPercents({
    commissionPercentOverride: options?.legacyCommissionPercentOverride ?? null,
    globalCommissionPercentOverride: options?.globalCommissionPercentOverride ?? null,
    goalReachedCommissionPercentOverride: options?.goalReachedCommissionPercentOverride ?? null,
  });
  const today = new Date().toISOString().slice(0, 10);
  const todayTotal = proofs
    .filter((proof) => String(proof.uploader ?? "").toLowerCase() === username)
    .filter((proof) => dayKey(proof.createdAt) === today)
    .reduce((acc, proof) => acc + Number(proof.saleValue ?? 0), 0);
  return todayTotal >= DAILY_TARGET ? commissions.goalReached : commissions.global;
}

export function computeAvailableFromProofsAndWithdrawals(
  username: string,
  proofs: ProofDoc[],
  withdrawals: WithdrawalDoc[],
  options?: {
    globalCommissionPercentOverride?: number | null;
    goalReachedCommissionPercentOverride?: number | null;
    legacyCommissionPercentOverride?: number | null;
    balanceAdjustment?: number;
    referralBonusAmount?: number;
  },
): WalletSnapshot {
  const commissionPercent = computeTodayCommissionPercentForUser(username, proofs, {
    globalCommissionPercentOverride: options?.globalCommissionPercentOverride,
    goalReachedCommissionPercentOverride: options?.goalReachedCommissionPercentOverride,
    legacyCommissionPercentOverride: options?.legacyCommissionPercentOverride,
  });
  const grossReal = proofs
    .filter((proof) => String(proof.uploader ?? "").toLowerCase() === username)
    .reduce((acc, proof) => acc + Number(proof.saleValue ?? 0) * (commissionPercent / 100), 0);
  const approvedTotal = withdrawals
    .filter(
      (w) => String(w.username ?? "").toLowerCase() === username && w.status === "approved",
    )
    .reduce((acc, w) => acc + Number(w.amount ?? 0), 0);
  const balanceAdjustment = Number(options?.balanceAdjustment ?? 0);
  const referralBonusAmount = Number(options?.referralBonusAmount ?? 0);
  return {
    commissionPercent,
    balanceAdjustment: Number(balanceAdjustment.toFixed(2)),
    referralBonusAmount: Number(referralBonusAmount.toFixed(2)),
    approvedTotal: Number(approvedTotal.toFixed(2)),
    grossReal: Number(grossReal.toFixed(2)),
    available: Number(
      Math.max(0, grossReal + referralBonusAmount - approvedTotal + balanceAdjustment).toFixed(2),
    ),
  };
}

export async function loadReferralBonusForUser(
  db: Db,
  username: string,
  proofs: ProofDoc[],
): Promise<number> {
  const invitees = await getInviteesByInviter(db, username);
  if (invitees.length === 0) return 0;
  const inviteeSet = new Set(invitees.map((i) => i.inviteeUsername));
  const invitedTotal = proofs
    .filter((proof) => inviteeSet.has(String(proof.uploader ?? "").toLowerCase()))
    .reduce((acc, proof) => acc + Number(proof.saleValue ?? 0), 0);
  const bonusPercent = await getReferralBonusPercent(db);
  return Number((invitedTotal * (bonusPercent / 100)).toFixed(2));
}

/**
 * Calcula o `balanceAdjustment` necessario para que o saldo disponivel
 * (`available`) seja exatamente `targetAvailable`, mantendo a formula:
 *   available = max(0, grossReal + referralBonus - approvedTotal + balanceAdjustment)
 *
 * Como o `Math.max(0, ...)` poderia esconder valores negativos, usamos a
 * forma sem clamp aqui (`balanceAdjustment` permite valor negativo).
 */
export function computeBalanceAdjustmentForTarget(
  snapshot: Pick<WalletSnapshot, "grossReal" | "referralBonusAmount" | "approvedTotal">,
  targetAvailable: number,
): number {
  const target = Math.max(0, Number(targetAvailable));
  const adjustment =
    target - snapshot.grossReal - snapshot.referralBonusAmount + snapshot.approvedTotal;
  return Number(adjustment.toFixed(2));
}
