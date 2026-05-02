import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { uploadFileToDiscordChannel } from "@/lib/discord";
import { getDbRequired, MongoUnavailableError } from "@/lib/mongodb";

type FineDoc = {
  username?: string;
  penaltyPercent?: number | null;
  expiresAt?: string | Date | null;
  durationType?: string;
};

function isFineActive(expiresAt: string | Date | null | undefined) {
  if (!expiresAt) return true;
  return new Date(expiresAt) > new Date();
}

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
    const filter = session.role === "admin" ? {} : { uploader: session.username };

    const proofs = await db
      .collection("proofs")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(
      proofs.map((proof) => ({
        id: String(proof._id),
        sellerName: proof.sellerName,
        productName: proof.productName,
        uploader: proof.uploader,
        saleValue: proof.saleValue ?? 0,
        grossSaleValue: proof.grossSaleValue ?? proof.saleValue ?? 0,
        penaltyPercentApplied: proof.penaltyPercentApplied ?? null,
        originalName: proof.originalName,
        mimeType: proof.mimeType,
        createdAt: proof.createdAt,
      })),
    );
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

  const formData = await request.formData();
  const sellerNameInput = formData.get("sellerName")?.toString().trim();
  const uploaderInput = formData.get("uploader")?.toString().trim();
  const productName = formData.get("productName")?.toString().trim();
  const saleValueRaw = formData.get("saleValue")?.toString().trim() ?? "";
  const file = formData.get("file");

  const sellerName =
    session.role === "member" ? session.username : (sellerNameInput ?? "");
  const uploaderUsername =
    session.role === "admin"
      ? String(uploaderInput ?? "").toLowerCase().trim()
      : session.username;
  const targetUsernameForPenalty = sellerName.toLowerCase();

  let saleValue = 0;
  if (saleValueRaw.length > 0) {
    const normalized = saleValueRaw.replace(",", ".");
    saleValue = Number.parseFloat(normalized);
    if (Number.isNaN(saleValue) || saleValue < 0) {
      return NextResponse.json(
        { error: "Valor do produto invalido." },
        { status: 400 },
      );
    }
  }

  if (saleValueRaw.length === 0) {
    return NextResponse.json(
      { error: "Informe o valor da venda em reais." },
      { status: 400 },
    );
  }

  if (!sellerName || !productName || !uploaderUsername || !(file instanceof File)) {
    return NextResponse.json(
      { error: "Preencha os campos e selecione um arquivo." },
      { status: 400 },
    );
  }

  let totalPenaltyPercent = 0;
  try {
    const dbForPenalty = await getDbRequired();
    const fines = (await dbForPenalty
      .collection("fines")
      .find({ username: targetUsernameForPenalty })
      .toArray()) as FineDoc[];
    for (const fine of fines) {
      if (!isFineActive(fine.expiresAt ?? null)) continue;
      totalPenaltyPercent += Number(fine.penaltyPercent ?? 0);
    }
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }

  const normalizedPenaltyPercent = Math.min(100, Math.max(0, totalPenaltyPercent));
  const netSaleValue = Number((saleValue * (1 - normalizedPenaltyPercent / 100)).toFixed(2));

  const arrayBuffer = await file.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  const discordToken = process.env.DISCORD_BOT_TOKEN;
  const discordUploadsChannelId = process.env.DISCORD_UPLOADS_CHANNEL_ID;
  if (!discordToken || !discordUploadsChannelId) {
    return NextResponse.json(
      {
        error:
          "Discord nao configurado. Defina DISCORD_BOT_TOKEN e DISCORD_UPLOADS_CHANNEL_ID no .env.local.",
      },
      { status: 503 },
    );
  }

  let discordFileUrl = "";
  try {
    const uploadResult = await uploadFileToDiscordChannel({
      channelId: discordUploadsChannelId,
      token: discordToken,
      fileBuffer,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      content: `Novo comprovante enviado por ${session.username} (${sellerName})`,
    });
    discordFileUrl = uploadResult.url;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no upload para o Discord.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  try {
    const db = await getDbRequired();
    const result = await db.collection("proofs").insertOne({
      sellerName,
      productName,
      saleValue: netSaleValue,
      grossSaleValue: saleValue,
      penaltyPercentApplied: normalizedPenaltyPercent,
      uploader: uploaderUsername,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      discordFileUrl,
      createdAt: new Date(),
    });

    return NextResponse.json({
      ok: true,
      id: String(result.insertedId),
      penaltyPercentApplied: normalizedPenaltyPercent,
      netSaleValue,
    });
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }
}
