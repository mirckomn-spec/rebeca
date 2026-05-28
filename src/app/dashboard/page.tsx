import { redirect } from "next/navigation";
import DashboardClient from "@/components/dashboard-client";
import { getSessionFromCookie } from "@/lib/auth";
import { listMemberUsernames } from "@/lib/members";
import { getDbSafe } from "@/lib/mongodb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getCurrentMs() {
  return Date.now();
}

export default async function DashboardPage() {
  const session = await getSessionFromCookie();
  if (!session) redirect("/");
  if (session.role !== "admin") redirect("/painel");

  type ProofRow = {
    _id: { toString(): string };
    sellerName?: string;
    productName?: string;
    uploader?: string;
    saleValue?: number;
    originalName?: string;
    mimeType?: string;
    createdAt: Date;
    grossSaleValue?: number;
    penaltyPercentApplied?: number | null;
  };

  let proofs: ProofRow[] = [];
  let dbError: string | null = null;
  const { db, error } = await getDbSafe();
  if (db) {
    proofs = (await db
      .collection("proofs")
      .find({})
      .sort({ createdAt: -1 })
      .toArray()) as unknown as ProofRow[];
  } else {
    dbError = error;
  }

  const initialProofs = proofs.map((proof) => ({
    id: String(proof._id),
    sellerName: String(proof.sellerName ?? ""),
    productName: String(proof.productName ?? ""),
    uploader: String(proof.uploader ?? ""),
    saleValue: Number(proof.saleValue ?? 0),
    grossSaleValue: Number(proof.grossSaleValue ?? proof.saleValue ?? 0),
    penaltyPercentApplied:
      proof.penaltyPercentApplied != null ? Number(proof.penaltyPercentApplied) : null,
    originalName: String(proof.originalName ?? ""),
    mimeType: String(proof.mimeType ?? ""),
    createdAt: new Date(proof.createdAt).toISOString(),
  }));

  const now = getCurrentMs();
  const dayMs = 24 * 60 * 60 * 1000;
  const count31 = initialProofs.filter(
    (item) => now - new Date(item.createdAt).getTime() <= 31 * dayMs,
  ).length;

  const memberNames = await listMemberUsernames();
  const membersMap = new Map<string, number>();
  for (const proof of initialProofs) {
    const key = String(proof.uploader || proof.sellerName).toLowerCase();
    if (!key || key === "bel") continue;
    const current = membersMap.get(key) ?? 0;
    membersMap.set(key, current + 1);
  }

  const members = [
    { username: "bel", role: "admin", totalSales: count31 },
    ...memberNames.map((username) => ({
      username,
      role: "membro",
      totalSales: membersMap.get(username) ?? 0,
    })),
  ];

  return (
    <DashboardClient initialProofs={initialProofs} members={members} dbError={dbError} />
  );
}
