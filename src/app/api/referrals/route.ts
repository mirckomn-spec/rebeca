import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { getDbRequired, MongoUnavailableError } from "@/lib/mongodb";
import {
  applyReferralCodeForUser,
  getInviteesByInviter,
  getOrCreateReferralCode,
  getReferralBonusPercent,
  getReferralLinkForInvitee,
} from "@/lib/referrals";

type ProofRow = {
  uploader?: string;
  saleValue?: number;
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
    const myCode = await getOrCreateReferralCode(db, session.username);
    const myLink = await getReferralLinkForInvitee(db, session.username);
    const invitees = await getInviteesByInviter(db, session.username);
    const invitedUsernames = invitees.map((item) => item.inviteeUsername);

    let metricsByInvitee: Record<string, { totalSold: number; referralBonus: number }> = {};
    if (invitedUsernames.length > 0) {
      const proofs = (await db
        .collection("proofs")
        .find({ uploader: { $in: invitedUsernames } })
        .toArray()) as ProofRow[];
      const bonusRate = getReferralBonusPercent() / 100;
      const totals = new Map<string, number>();
      for (const row of proofs) {
        const u = String(row.uploader ?? "").toLowerCase();
        if (!u) continue;
        totals.set(u, (totals.get(u) ?? 0) + Number(row.saleValue ?? 0));
      }
      metricsByInvitee = Object.fromEntries(
        invitedUsernames.map((u) => {
          const totalSold = Number((totals.get(u) ?? 0).toFixed(2));
          return [u, { totalSold, referralBonus: Number((totalSold * bonusRate).toFixed(2)) }];
        }),
      );
    }

    const inviteesDetailed = invitees.map((item) => ({
      ...item,
      totalSold: metricsByInvitee[item.inviteeUsername]?.totalSold ?? 0,
      referralBonus: metricsByInvitee[item.inviteeUsername]?.referralBonus ?? 0,
    }));
    const referralBonusTotal = Number(
      inviteesDetailed.reduce((acc, item) => acc + item.referralBonus, 0).toFixed(2),
    );

    return NextResponse.json({
      myCode,
      bonusPercent: getReferralBonusPercent(),
      myInviter: myLink,
      invitees: inviteesDetailed,
      referralBonusTotal,
    });
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }
}

export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { code?: string } | null;
  const code = String(body?.code ?? "").trim();
  if (!code) {
    return NextResponse.json({ error: "Informe o codigo de indicacao." }, { status: 400 });
  }

  try {
    const db = await getDbRequired();
    const applied = await applyReferralCodeForUser(db, session.username, code);
    return NextResponse.json({ ok: true, applied });
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    const message = e instanceof Error ? e.message : "Falha ao aplicar codigo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
