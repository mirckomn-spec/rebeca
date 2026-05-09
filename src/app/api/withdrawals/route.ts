import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { getSessionFromCookie } from "@/lib/auth";
import { getDbRequired, MongoUnavailableError } from "@/lib/mongodb";
import { getAllMemberControls } from "@/lib/member-controls";
import {
  computeAvailableFromProofsAndWithdrawals,
  loadReferralBonusForUser,
} from "@/lib/wallet";

const DEFAULT_MIN_WITHDRAW = 200;

type ProofDoc = {
  uploader?: string;
  saleValue?: number;
  createdAt: string | Date;
};

type WithdrawalDoc = {
  id: string;
  username: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  rejectionReason?: string | null;
};

function normalizeWithdrawalStatus(value: unknown): WithdrawalDoc["status"] {
  const status = String(value ?? "").toLowerCase();
  if (status === "approved" || status === "rejected") return status;
  return "pending";
}

function normalizeWithdrawalRow(row: Partial<WithdrawalDoc>): WithdrawalDoc {
  return {
    id: String(row.id ?? ""),
    username: String(row.username ?? "").toLowerCase(),
    amount: Number(row.amount ?? 0),
    status: normalizeWithdrawalStatus(row.status),
    requestedAt: String(row.requestedAt ?? new Date().toISOString()),
    reviewedAt: row.reviewedAt ? String(row.reviewedAt) : null,
    reviewedBy: row.reviewedBy ? String(row.reviewedBy) : null,
    rejectionReason: row.rejectionReason ? String(row.rejectionReason) : null,
  };
}

function toIsoStringIfDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (value == null) return null;
  return String(value);
}

function normalizeProofRow(row: Partial<ProofDoc>): ProofDoc {
  return {
    uploader: String(row.uploader ?? "").toLowerCase(),
    saleValue: Number(row.saleValue ?? 0),
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? ""),
  };
}

async function loadProofs(db: Db): Promise<ProofDoc[]> {
  const dbProofs = (await db.collection("proofs").find({}).toArray()) as unknown as ProofDoc[];
  return dbProofs.map((item) => normalizeProofRow(item));
}

async function loadWithdrawals(db: Db): Promise<WithdrawalDoc[]> {
  const dbWithdrawalsRaw = (await db
    .collection("withdrawals")
    .find({})
    .sort({ requestedAt: -1 })
    .toArray()) as unknown as WithdrawalDoc[];
  return dbWithdrawalsRaw.map((item) =>
    normalizeWithdrawalRow({
      ...item,
      requestedAt: toIsoStringIfDate((item as unknown as { requestedAt?: unknown }).requestedAt) ?? "",
      reviewedAt: toIsoStringIfDate((item as unknown as { reviewedAt?: unknown }).reviewedAt),
    }),
  );
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

  try {
    const db = await getDbRequired();
    const sessionUsername = String(session.username ?? "").toLowerCase();
    const { searchParams } = new URL(request.url);
    const usernameParam = String(searchParams.get("username") ?? "").trim().toLowerCase();
    const targetUsername =
      session.role === "admin" && usernameParam ? usernameParam : sessionUsername;

    const controls = await getAllMemberControls();
    const controlsMap = new Map(controls.map((item) => [item.username, item]));

    const minWithdraw = Number(
      (await db.collection("settings").findOne<{ minWithdraw?: unknown }>({ key: "withdrawals" }))
        ?.minWithdraw ?? DEFAULT_MIN_WITHDRAW,
    );

    const proofs = await loadProofs(db);
    const allWithdrawals = await loadWithdrawals(db);

    const visible =
      session.role === "admin"
        ? allWithdrawals
        : allWithdrawals.filter((w) => w.username === sessionUsername);

    const control = controlsMap.get(targetUsername);
    const referralBonusAmount = await loadReferralBonusForUser(db, targetUsername, proofs);
    const wallet = computeAvailableFromProofsAndWithdrawals(targetUsername, proofs, allWithdrawals, {
      globalCommissionPercentOverride: control?.globalCommissionPercentOverride ?? null,
      goalReachedCommissionPercentOverride:
        control?.goalReachedCommissionPercentOverride ?? null,
      legacyCommissionPercentOverride: control?.commissionPercentOverride ?? null,
      balanceAdjustment: control?.balanceAdjustment ?? 0,
      referralBonusAmount,
    });

    return NextResponse.json({
      minWithdraw,
      wallet,
      withdrawals: visible,
    });
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }
}

export async function POST() {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }
  const sessionUsername = String(session.username ?? "").toLowerCase();
  if (session.role !== "member") {
    return NextResponse.json({ error: "Somente membros podem solicitar saque." }, { status: 403 });
  }

  try {
    const db = await getDbRequired();
    const controls = await getAllMemberControls();
    const controlsMap = new Map(controls.map((item) => [item.username, item]));

    const minWithdraw = Number(
      (await db.collection("settings").findOne<{ minWithdraw?: unknown }>({ key: "withdrawals" }))
        ?.minWithdraw ?? DEFAULT_MIN_WITHDRAW,
    );

    const proofs = await loadProofs(db);
    const withdrawals = await loadWithdrawals(db);
    const pending = withdrawals.find(
      (w) => w.username === sessionUsername && w.status === "pending",
    );
    if (pending) {
      return NextResponse.json(
        { error: "Voce ja possui uma solicitacao de saque pendente." },
        { status: 400 },
      );
    }

    const control = controlsMap.get(sessionUsername);
    const referralBonusAmount = await loadReferralBonusForUser(db, sessionUsername, proofs);
    const wallet = computeAvailableFromProofsAndWithdrawals(sessionUsername, proofs, withdrawals, {
      globalCommissionPercentOverride: control?.globalCommissionPercentOverride ?? null,
      goalReachedCommissionPercentOverride:
        control?.goalReachedCommissionPercentOverride ?? null,
      legacyCommissionPercentOverride: control?.commissionPercentOverride ?? null,
      balanceAdjustment: control?.balanceAdjustment ?? 0,
      referralBonusAmount,
    });
    if (wallet.available < minWithdraw) {
      return NextResponse.json(
        { error: `Saque minimo: R$ ${minWithdraw.toFixed(2)}.` },
        { status: 400 },
      );
    }

    const now = new Date();
    const requestId = randomUUID();
    await db.collection("withdrawals").insertOne({
      id: requestId,
      username: sessionUsername,
      amount: wallet.available,
      status: "pending" as const,
      requestedAt: now,
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
    });

    return NextResponse.json({
      ok: true,
      request: {
        id: requestId,
        username: sessionUsername,
        amount: wallet.available,
        status: "pending",
        requestedAt: now.toISOString(),
        reviewedAt: null,
        reviewedBy: null,
        rejectionReason: null,
      },
    });
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }
}

export async function PATCH(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Somente admin pode revisar saques." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    action?: "approve" | "reject";
    rejectionReason?: string;
  } | null;
  const id = String(body?.id ?? "");
  const action = body?.action;
  if (!id || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Dados invalidos." }, { status: 400 });
  }

  const reviewedAt = new Date().toISOString();
  if (action === "reject" && !String(body?.rejectionReason ?? "").trim()) {
    return NextResponse.json({ error: "Informe o motivo da recusa." }, { status: 400 });
  }

  try {
    const db = await getDbRequired();
    const controls = await getAllMemberControls();
    const controlsMap = new Map(controls.map((item) => [item.username, item]));

    const target = await db.collection("withdrawals").findOne({ id });
    if (!target) {
      return NextResponse.json({ error: "Solicitacao nao encontrada." }, { status: 404 });
    }

    if (normalizeWithdrawalStatus(target.status) !== "pending") {
      return NextResponse.json({ error: "Solicitacao ja foi revisada." }, { status: 400 });
    }

    let amountToSave = Number(target.amount ?? 0);
    if (action === "approve") {
      const proofs = await loadProofs(db);
      const allWithdrawals = await loadWithdrawals(db);
      const targetUsername = String(target.username ?? "").toLowerCase();
      const control = controlsMap.get(targetUsername);
      const referralBonusAmount = await loadReferralBonusForUser(db, targetUsername, proofs);
      amountToSave = computeAvailableFromProofsAndWithdrawals(
        targetUsername,
        proofs,
        allWithdrawals,
        {
          globalCommissionPercentOverride: control?.globalCommissionPercentOverride ?? null,
          goalReachedCommissionPercentOverride:
            control?.goalReachedCommissionPercentOverride ?? null,
          legacyCommissionPercentOverride: control?.commissionPercentOverride ?? null,
          balanceAdjustment: control?.balanceAdjustment ?? 0,
          referralBonusAmount,
        },
      ).available;
    }

    await db.collection("withdrawals").updateOne(
      { id },
      {
        $set: {
          amount: Number(amountToSave.toFixed(2)),
          status: action === "approve" ? "approved" : "rejected",
          reviewedAt: new Date(),
          reviewedBy: session.username,
          rejectionReason: action === "reject" ? String(body?.rejectionReason ?? "").trim() : null,
        },
      },
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }
}
