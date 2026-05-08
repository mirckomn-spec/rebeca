import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { uploadFileToDiscordChannel } from "@/lib/discord";
import { getDbRequired, MongoUnavailableError } from "@/lib/mongodb";
import { getClientIp, takeRateLimitSlot } from "@/lib/rate-limit";
import { jsonNoStore, mongoUnavailable, NO_STORE_HEADERS } from "@/lib/http";

const PROOF_COOLDOWN_MS = 10_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_PREFIXES = ["image/", "video/"];

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

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) {
    return jsonNoStore({ error: "Nao autorizado." }, { status: 401 });
  }

  try {
    const db = await getDbRequired();
    const filter = session.role === "admin" ? {} : { uploader: session.username };

    const proofs = await db
      .collection("proofs")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    // Para membros: NAO devolvemos `grossSaleValue` nem `penaltyPercentApplied`
    // (sao informacoes sensiveis que mostram o valor antes da multa).
    // Para admin: devolvemos esses dados completos.
    return jsonNoStore(
      proofs.map((proof) => {
        const base = {
          id: String(proof._id),
          sellerName: proof.sellerName,
          productName: proof.productName,
          uploader: proof.uploader,
          saleValue: proof.saleValue ?? 0,
          originalName: proof.originalName,
          mimeType: proof.mimeType,
          createdAt: proof.createdAt,
        };
        if (session.role === "admin") {
          return {
            ...base,
            grossSaleValue: proof.grossSaleValue ?? proof.saleValue ?? 0,
            penaltyPercentApplied: proof.penaltyPercentApplied ?? null,
          };
        }
        return base;
      }),
    );
  } catch (e) {
    const r = mongoUnavailable(e);
    if (r) return r;
    throw e;
  }
}

export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return jsonNoStore({ error: "Nao autorizado." }, { status: 401 });
  }

  // Cooldown por usuario (e por IP, para evitar contas que rodizam logins).
  const ip = getClientIp(request);
  const userKey = `proof:user:${session.username}`;
  const ipKey = `proof:ip:${ip}`;
  const userSlot = takeRateLimitSlot(userKey, PROOF_COOLDOWN_MS);
  if (!userSlot.allowed) {
    return NextResponse.json(
      {
        error: `Aguarde ${Math.ceil(userSlot.retryAfterMs / 1000)}s antes de enviar outro comprovante.`,
        retryAfterMs: userSlot.retryAfterMs,
      },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          "Retry-After": String(Math.ceil(userSlot.retryAfterMs / 1000)),
        },
      },
    );
  }
  const ipSlot = takeRateLimitSlot(ipKey, PROOF_COOLDOWN_MS);
  if (!ipSlot.allowed) {
    return NextResponse.json(
      {
        error: `Aguarde ${Math.ceil(ipSlot.retryAfterMs / 1000)}s antes de enviar outro comprovante.`,
        retryAfterMs: ipSlot.retryAfterMs,
      },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          "Retry-After": String(Math.ceil(ipSlot.retryAfterMs / 1000)),
        },
      },
    );
  }

  const formData = await request.formData();
  const sellerNameInput = formData.get("sellerName")?.toString().trim();
  const uploaderInput = formData.get("uploader")?.toString().trim();
  const productName = formData.get("productName")?.toString().trim();
  const saleValueRaw = formData.get("saleValue")?.toString().trim() ?? "";
  const file = formData.get("file");

  const uploaderUsername =
    session.role === "admin"
      ? String(uploaderInput ?? "").toLowerCase().trim()
      : session.username;
  const sellerName =
    session.role === "member"
      ? session.username
      : (sellerNameInput && sellerNameInput.length > 0
          ? sellerNameInput
          : uploaderUsername);
  const targetUsernameForPenalty = sellerName.toLowerCase();

  let saleValue = 0;
  if (saleValueRaw.length > 0) {
    const normalized = saleValueRaw.replace(",", ".");
    saleValue = Number.parseFloat(normalized);
    if (Number.isNaN(saleValue) || saleValue < 0 || saleValue > 1_000_000) {
      return jsonNoStore(
        { error: "Valor do produto invalido." },
        { status: 400 },
      );
    }
  } else {
    return jsonNoStore(
      { error: "Informe o valor da venda em reais." },
      { status: 400 },
    );
  }

  if (!sellerName || !productName || !uploaderUsername || !(file instanceof File)) {
    return jsonNoStore(
      { error: "Preencha os campos e selecione um arquivo." },
      { status: 400 },
    );
  }

  if (productName.length > 200 || sellerName.length > 100 || uploaderUsername.length > 50) {
    return jsonNoStore({ error: "Dados muito longos." }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return jsonNoStore(
      { error: "Arquivo muito grande. Limite: 25 MB." },
      { status: 413 },
    );
  }
  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED_PREFIXES.some((prefix) => mime.startsWith(prefix))) {
    return jsonNoStore(
      { error: "Tipo de arquivo invalido. Envie imagem ou video." },
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
    const r = mongoUnavailable(e);
    if (r) return r;
    if (e instanceof MongoUnavailableError) {
      return r ?? jsonNoStore({ error: "Servico indisponivel." }, { status: 503 });
    }
    throw e;
  }

  const normalizedPenaltyPercent = Math.min(100, Math.max(0, totalPenaltyPercent));
  const netSaleValue = Number((saleValue * (1 - normalizedPenaltyPercent / 100)).toFixed(2));

  const arrayBuffer = await file.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  const discordToken = process.env.DISCORD_BOT_TOKEN;
  const discordUploadsChannelId = process.env.DISCORD_UPLOADS_CHANNEL_ID;
  if (!discordToken || !discordUploadsChannelId) {
    return jsonNoStore(
      { error: "Servico de armazenamento indisponivel no momento." },
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
  } catch {
    return jsonNoStore(
      { error: "Falha ao enviar arquivo. Tente novamente." },
      { status: 502 },
    );
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

    return jsonNoStore({
      ok: true,
      id: String(result.insertedId),
      penaltyPercentApplied: session.role === "admin" ? normalizedPenaltyPercent : undefined,
      netSaleValue,
      cooldownMs: PROOF_COOLDOWN_MS,
    });
  } catch (e) {
    const r = mongoUnavailable(e);
    if (r) return r;
    throw e;
  }
}
