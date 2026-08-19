import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/media/:id — serve os bytes de uma foto recebida via WhatsApp
 * (ver `MediaAsset` no schema e o tratamento de `imageMessage` no webhook).
 *
 * Rota PÚBLICA de propósito — sem `auth()` — porque o link é embutido na
 * notificação final de lead enviada para o WhatsApp da recepcionista do
 * salão, que não tem (nem precisa ter) login nesta plataforma. O `id` é um
 * cuid, então a URL funciona como um "unlisted link": só quem tem o link
 * exato consegue abrir a foto. Por isso é excluída do middleware de sessão
 * (ver `src/middleware.ts`, matcher já ignora qualquer caminho com extensão
 * — mas este caminho não tem extensão, então precisa da exclusão explícita
 * de `api/media`).
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: params.id } });
  if (!asset) {
    return NextResponse.json({ error: "Mídia não encontrada" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(asset.data), {
    headers: {
      "Content-Type": asset.mimetype,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
