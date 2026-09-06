import { fetchDriveFile, getDriveFileMetadata } from "@/lib/google";
import { getPublications } from "@/lib/publications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ fileId: string }> };

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|\r\n]+/g, "-").trim() || "documento";
}

export async function GET(request: Request, { params }: RouteContext) {
  const { fileId } = await params;
  if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) {
    return Response.json({ error: "Identificador de archivo inválido." }, { status: 400 });
  }

  try {
    const publications = await getPublications();
    const allowed = publications.some((publication) =>
      publication.documents.some((document) => document.pdfFileId === fileId || document.mdFileId === fileId),
    );
    if (!allowed) {
      return Response.json({ error: "El archivo no pertenece a una publicación disponible." }, { status: 404 });
    }

    const [metadata, upstream] = await Promise.all([
      getDriveFileMetadata(fileId),
      fetchDriveFile(fileId, request.headers.get("range")),
    ]);

    if (!upstream.ok && upstream.status !== 206) {
      return Response.json({ error: "No fue posible cargar el documento." }, { status: upstream.status || 502 });
    }

    const download = new URL(request.url).searchParams.get("download") === "1";
    const headers = new Headers();
    const contentType = upstream.headers.get("content-type") || metadata.mimeType || "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    const acceptRanges = upstream.headers.get("accept-ranges");

    headers.set("Content-Type", contentType);
    headers.set("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${safeFilename(metadata.name)}"`);
    headers.set("Cache-Control", "public, max-age=60, s-maxage=300");
    headers.set("X-Content-Type-Options", "nosniff");
    if (contentLength) headers.set("Content-Length", contentLength);
    if (contentRange) headers.set("Content-Range", contentRange);
    if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    console.error("No se pudo servir el documento del monitor", error);
    return Response.json({ error: "No fue posible preparar el documento." }, { status: 502 });
  }
}
