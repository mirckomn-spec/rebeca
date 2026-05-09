import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { getDbRequired, MongoUnavailableError } from "@/lib/mongodb";
import {
  getAllMemberControls,
  upsertMemberControl,
} from "@/lib/member-controls";
import {
  computeAvailableFromProofsAndWithdrawals,
  computeBalanceAdjustmentForTarget,
  loadReferralBonusForUser,
} from "@/lib/wallet";

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

function mongo503(e: unknown) {
  if (e instanceof MongoUnavailableError) {
    return NextResponse.json(
      { error: "Servico temporariamente indisponivel. Tente novamente em instantes." },
      { status: 503 },
    );
  }
  return null;
}

function normalizeWithdrawalStatus(value: unknown): WithdrawalDoc["status"] {
  const status = String(value ?? "").toLowerCase();
  if (status === "approved" || status === "rejected") return status;
  return "pending";
}

/**
 * GET /api/admin/wallet?username=foo
 * Retorna o snapshot atual da carteira de um membro (saldo disponivel,
 * comissao do dia, breakdown). Apenas admin.
 */
export async function GET(request: Request) {
  const session = await getSessionFromCookie();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const username = String(url.searchParams.get("username") ?? "").trim().toLowerCase();
  if (!username || username === "bel") {
    return NextResponse.json({ error: "Usuario invalido." }, { status: 400 });
  }

  try {
    const db = await getDbRequired();
    const proofs = (await db
      .collection("proofs")
      .find({})
      .toArray()) as unknown as ProofDoc[];
    const withdrawalsRaw = (await db.collection("withdrawals").find({}).toArray()) as Array<
      Partial<WithdrawalDoc>
    >;
    const withdrawals: WithdrawalDoc[] = withdrawalsRaw.map((w) => ({
      username: String(w.username ?? "").toLowerCase(),
      amount: Number(w.amount ?? 0),
      status: normalizeWithdrawalStatus(w.status),
    }));

    const controls = await getAllMemberControls();
    const control = controls.find((item) => item.username === username);
    const referralBonusAmount = await loadReferralBonusForUser(db, username, proofs);
    const wallet = computeAvailableFromProofsAndWithdrawals(username, proofs, withdrawals, {
      globalCommissionPercentOverride: control?.globalCommissionPercentOverride ?? null,
      goalReachedCommissionPercentOverride:
        control?.goalReachedCommissionPercentOverride ?? null,
      legacyCommissionPercentOverride: control?.commissionPercentOverride ?? null,
      balanceAdjustment: control?.balanceAdjustment ?? 0,
      referralBonusAmount,
    });

    return NextResponse.json({ username, wallet });
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }
}

/**
 * POST /api/admin/wallet
 * Body: { username: string; setAvailableTo: number }
 * Define o saldo disponivel ABSOLUTO para o usuario, ajustando
 * `balanceAdjustment` para que o calculo final bata com o valor desejado.
 */
export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        username?: string;
        setAvailableTo?: number;
      }
    | null;

  const username = String(body?.username ?? "").trim().toLowerCase();
  if (!username || username === "bel") {
    return NextResponse.json({ error: "Usuario invalido." }, { status: 400 });
  }

  const targetRaw = Number(body?.setAvailableTo);
  if (!Number.isFinite(targetRaw) || targetRaw < 0 || targetRaw > 1_000_000) {
    return NextResponse.json(
      { error: "Saldo invalido (informe um numero entre 0 e 1.000.000)." },
      { status: 400 },
    );
  }
  const target = Number(targetRaw.toFixed(2));

  try {
    const db = await getDbRequired();
    const proofs = (await db
      .collection("proofs")
      .find({})
      .toArray()) as unknown as ProofDoc[];
    const withdrawalsRaw = (await db.collection("withdrawals").find({}).toArray()) as Array<
      Partial<WithdrawalDoc>
    >;
    const withdrawals: WithdrawalDoc[] = withdrawalsRaw.map((w) => ({
      username: String(w.username ?? "").toLowerCase(),
      amount: Number(w.amount ?? 0),
      status: normalizeWithdrawalStatus(w.status),
    }));

    const controls = await getAllMemberControls();
    const control = controls.find((item) => item.username === username);
    const referralBonusAmount = await loadReferralBonusForUser(db, username, proofs);
    const snapshot = computeAvailableFromProofsAndWithdrawals(username, proofs, withdrawals, {
      globalCommissionPercentOverride: control?.globalCommissionPercentOverride ?? null,
      goalReachedCommissionPercentOverride:
        control?.goalReachedCommissionPercentOverride ?? null,
      legacyCommissionPercentOverride: control?.commissionPercentOverride ?? null,
      balanceAdjustment: 0, // calcular o ajuste do zero
      referralBonusAmount,
    });

    const newAdjustment = computeBalanceAdjustmentForTarget(snapshot, target);

    const saved = await upsertMemberControl(
      username,
      { balanceAdjustment: newAdjustment },
      session.username,
    );

    // Recalcula o snapshot final para confirmar
    const finalWallet = computeAvailableFromProofsAndWithdrawals(
      username,
      proofs,
      withdrawals,
      {
        globalCommissionPercentOverride: control?.globalCommissionPercentOverride ?? null,
        goalReachedCommissionPercentOverride:
          control?.goalReachedCommissionPercentOverride ?? null,
        legacyCommissionPercentOverride: control?.commissionPercentOverride ?? null,
        balanceAdjustment: saved.balanceAdjustment,
        referralBonusAmount,
      },
    );

    return NextResponse.json({
      ok: true,
      username,
      balanceAdjustment: saved.balanceAdjustment,
      wallet: finalWallet,
    });
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }
}
