import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { getDbRequired, MongoUnavailableError } from "@/lib/mongodb";
import {
  getAllReferralLinks,
  getDefaultReferralBonusPercent,
  getReferralBonusPercent,
  setReferralBonusPercent,
} from "@/lib/referrals";

type ProofRow = {
  uploader?: string;
  saleValue?: number;
};

function mongo503(error: unknown) {
  if (error instanceof MongoUnavailableError) {
    return NextResponse.json(
      { error: "Servico temporariamente indisponivel. Tente novamente em instantes." },
      { status: 503 },
    );
  }
  return null;
}

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }
  try {
    const db = await getDbRequired();
    const [bonusPercent, links] = await Promise.all([
      getReferralBonusPercent(db),
      getAllReferralLinks(db),
    ]);

    const inviteeUsernames = Array.from(new Set(links.map((l) => l.inviteeUsername)));
    const totalsByInvitee = new Map<string, number>();
    if (inviteeUsernames.length > 0) {
      const proofs = (await db
        .collection("proofs")
        .find({ uploader: { $in: inviteeUsernames } })
        .toArray()) as ProofRow[];
      for (const proof of proofs) {
        const u = String(proof.uploader ?? "").toLowerCase();
        if (!u) continue;
        totalsByInvitee.set(u, (totalsByInvitee.get(u) ?? 0) + Number(proof.saleValue ?? 0));
      }
    }

    const bonusRate = bonusPercent / 100;
    const linksDetailed = links.map((link) => {
      const totalSold = Number((totalsByInvitee.get(link.inviteeUsername) ?? 0).toFixed(2));
      return {
        ...link,
        totalSold,
        referralBonus: Number((totalSold * bonusRate).toFixed(2)),
      };
    });

    const groupedByInviterMap = new Map<
      string,
      {
        inviterUsername: string;
        invitees: typeof linksDetailed;
        totalSold: number;
        referralBonus: number;
      }
    >();
    for (const link of linksDetailed) {
      const key = link.inviterUsername;
      const entry =
        groupedByInviterMap.get(key) ?? {
          inviterUsername: key,
          invitees: [] as typeof linksDetailed,
          totalSold: 0,
          referralBonus: 0,
        };
      entry.invitees.push(link);
      entry.totalSold = Number((entry.totalSold + link.totalSold).toFixed(2));
      entry.referralBonus = Number((entry.referralBonus + link.referralBonus).toFixed(2));
      groupedByInviterMap.set(key, entry);
    }
    const groupedByInviter = Array.from(groupedByInviterMap.values()).sort((a, b) =>
      a.inviterUsername.localeCompare(b.inviterUsername),
    );

    return NextResponse.json({
      bonusPercent,
      defaultBonusPercent: getDefaultReferralBonusPercent(),
      links: linksDetailed,
      groupedByInviter,
    });
  } catch (error) {
    const r = mongo503(error);
    if (r) return r;
    const message = error instanceof Error ? error.message : "Falha ao carregar indicacoes.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSessionFromCookie();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }
  try {
    const body = (await request.json().catch(() => null)) as {
      bonusPercent?: number | string;
    } | null;
    if (body?.bonusPercent === undefined || body?.bonusPercent === null) {
      return NextResponse.json({ error: "Informe o percentual." }, { status: 400 });
    }
    const raw = String(body.bonusPercent).replace(",", ".");
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return NextResponse.json(
        { error: "Percentual invalido. Use um numero entre 0 e 100." },
        { status: 400 },
      );
    }
    const db = await getDbRequired();
    const saved = await setReferralBonusPercent(db, value);
    return NextResponse.json({ ok: true, bonusPercent: saved });
  } catch (error) {
    const r = mongo503(error);
    if (r) return r;
    const message = error instanceof Error ? error.message : "Falha ao salvar percentual.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
