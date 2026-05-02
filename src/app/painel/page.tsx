import { redirect } from "next/navigation";
import MembrosPainelClient from "@/components/membros-painel-client";
import { getSessionFromCookie } from "@/lib/auth";
import { getDbRequired, MongoUnavailableError } from "@/lib/mongodb";

export default async function PainelPage() {
  const session = await getSessionFromCookie();
  if (!session) redirect("/");
  if (session.role !== "member") redirect("/dashboard");

  type ProofRow = {
    _id: { toString(): string };
    sellerName?: string;
    productName?: string;
    uploader?: string;
    saleValue?: number;
    originalName?: string;
    mimeType?: string;
    createdAt: Date;
  };

  let proofs: ProofRow[] = [];
  try {
    const db = await getDbRequired();
    proofs = (await db
      .collection("proofs")
      .find({ uploader: session.username })
      .sort({ createdAt: -1 })
      .toArray()) as unknown as ProofRow[];
  } catch (e) {
    if (e instanceof MongoUnavailableError) {
      redirect("/?erro=banco");
    }
    throw e;
  }

  const initialProofs = proofs.map((proof) => ({
    id: String(proof._id),
    sellerName: String(proof.sellerName ?? ""),
    productName: String(proof.productName ?? ""),
    uploader: String(proof.uploader ?? ""),
    saleValue: Number(proof.saleValue ?? 0),
    originalName: String(proof.originalName ?? ""),
    mimeType: String(proof.mimeType ?? ""),
    createdAt: new Date(proof.createdAt).toISOString(),
  }));

  return (
    <MembrosPainelClient username={session.username} initialProofs={initialProofs} />
  );
}
