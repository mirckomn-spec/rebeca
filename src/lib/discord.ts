import "server-only";

type UploadDiscordInput = {
  channelId: string;
  token: string;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  content?: string;
};

type DiscordUploadResult = {
  url: string;
  attachmentId: string;
  messageId: string;
};

export async function uploadFileToDiscordChannel({
  channelId,
  token,
  fileBuffer,
  fileName,
  mimeType,
  content,
}: UploadDiscordInput): Promise<DiscordUploadResult> {
  const formData = new FormData();
  const payload = { content: content ?? "" };
  formData.set("payload_json", JSON.stringify(payload));
  formData.set("files[0]", new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), fileName);

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    // Le e descarta o body para nao deixar a conexao pendurada,
    // mas NAO repassa para o cliente (poderia conter detalhes do bot).
    await response.text().catch(() => "");
    throw new Error("Falha no upload do arquivo.");
  }

  const data = (await response.json()) as {
    id: string;
    attachments?: Array<{ id: string; url: string }>;
  };

  const attachment = data.attachments?.[0];
  if (!attachment?.url) {
    throw new Error("Falha no upload do arquivo.");
  }

  return {
    url: attachment.url,
    attachmentId: attachment.id,
    messageId: data.id,
  };
}
