import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { uploadFileToDiscordChannel } from "@/lib/discord";
import { getDbRequired, MongoUnavailableError } from "@/lib/mongodb";

function mongo503(e: unknown) {
  if (e instanceof MongoUnavailableError) {
    return NextResponse.json(
      { error: "Servico temporariamente indisponivel. Tente novamente em instantes." },
      { status: 503 },
    );
  }
  return null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const db = await getDbRequired();

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Comprovante invalido." }, { status: 400 });
    }
    const proof = await db
      .collection("proofs")
      .findOne<{
        discordFileUrl?: string;
        storedName?: string;
        mimeType: string;
        originalName: string;
        uploader?: string;
      }>({
        _id: new ObjectId(id),
      });

    if (!proof) {
      return NextResponse.json({ error: "Comprovante nao encontrado." }, { status: 404 });
    }

    if (
      session.role === "member" &&
      String(proof.uploader ?? "").toLowerCase() !== session.username
    ) {
      return NextResponse.json({ error: "Nao autorizado." }, { status: 403 });
    }

    if (proof.discordFileUrl) {
      return NextResponse.redirect(proof.discordFileUrl);
    }

    return NextResponse.json(
      {
        error:
          "Arquivo sem URL publica. Comprovantes antigos armazenados apenas no servidor nao estao disponiveis na Vercel — reenvie o comprovante.",
      },
      { status: 404 },
    );
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromCookie();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const db = await getDbRequired();

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Comprovante invalido." }, { status: 400 });
    }

    const result = await db.collection("proofs").deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Comprovante nao encontrado." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, storage: "mongodb" });
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromCookie();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const { id } = await context.params;
  const contentType = request.headers.get("content-type") ?? "";
  let productName: string | null = null;
  let saleValue: number | null = null;
  let replacementFile: File | null = null;
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const pn = String(formData.get("productName") ?? "").trim();
    const sv = Number(String(formData.get("saleValue") ?? ""));
    const f = formData.get("file");
    productName = pn || null;
    saleValue = Number.isFinite(sv) ? sv : null;
    replacementFile = f instanceof File ? f : null;
  } else {
    const body = (await request.json().catch(() => null)) as
      | { productName?: string; saleValue?: number }
      | null;
    const pn = String(body?.productName ?? "").trim();
    const sv = Number(body?.saleValue);
    productName = pn || null;
    saleValue = Number.isFinite(sv) ? sv : null;
  }

  try {
    const db = await getDbRequired();

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Comprovante invalido." }, { status: 400 });
    }
    const setDoc: Record<string, unknown> = {};
    if (productName) setDoc.productName = productName;
    if (saleValue != null && saleValue >= 0) setDoc.saleValue = Number(saleValue.toFixed(2));
    if (replacementFile) {
      const discordToken = process.env.DISCORD_BOT_TOKEN;
      const discordUploadsChannelId = process.env.DISCORD_UPLOADS_CHANNEL_ID;
      if (!discordToken || !discordUploadsChannelId) {
        return NextResponse.json(
          { error: "Servico de armazenamento indisponivel no momento." },
          { status: 503 },
        );
      }
      const arrayBuffer = await replacementFile.arrayBuffer();
      const uploadResult = await uploadFileToDiscordChannel({
        channelId: discordUploadsChannelId,
        token: discordToken,
        fileBuffer: Buffer.from(arrayBuffer),
        fileName: replacementFile.name,
        mimeType: replacementFile.type || "application/octet-stream",
        content: `Comprovante atualizado por ${session.username}`,
      });
      setDoc.discordFileUrl = uploadResult.url;
      setDoc.originalName = replacementFile.name;
      setDoc.mimeType = replacementFile.type || "application/octet-stream";
    }
    if (Object.keys(setDoc).length === 0) {
      return NextResponse.json({ error: "Nenhuma alteracao enviada." }, { status: 400 });
    }
    const result = await db.collection("proofs").updateOne({ _id: new ObjectId(id) }, { $set: setDoc });
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Comprovante nao encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, storage: "mongodb" });
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }
}
