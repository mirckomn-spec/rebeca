import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { uploadFileToDiscordChannel } from "@/lib/discord";
import { getDbRequired, MongoUnavailableError } from "@/lib/mongodb";

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
    const profile = await db.collection("profiles").findOne({
      username: session.username,
    });

    return NextResponse.json({
      username: session.username,
      avatarName: profile?.avatarUrl ? "stored" : null,
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

  const formData = await request.formData();
  const file = formData.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Selecione uma imagem." }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "A foto de perfil deve ser uma imagem." },
      { status: 400 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const avatarBuffer = Buffer.from(arrayBuffer);
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

  let discordAvatarUrl = "";
  try {
    const uploadResult = await uploadFileToDiscordChannel({
      channelId: discordUploadsChannelId,
      token: discordToken,
      fileBuffer: avatarBuffer,
      fileName: file.name,
      mimeType: file.type || "image/jpeg",
      content: `Novo avatar enviado por ${session.username}`,
    });
    discordAvatarUrl = uploadResult.url;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no upload para o Discord.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  try {
    const db = await getDbRequired();
    await db.collection("profiles").updateOne(
      { username: session.username },
      {
        $set: {
          username: session.username,
          avatarUrl: discordAvatarUrl,
          avatarMimeType: file.type || "image/jpeg",
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );

    return NextResponse.json({ ok: true, avatarName: "stored" });
  } catch (e) {
    const r = mongo503(e);
    if (r) return r;
    throw e;
  }
}
