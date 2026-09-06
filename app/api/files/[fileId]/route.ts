import { NextRequest } from "next/server";
import { fetchDriveFile, getDriveFileMetadata } from "@/lib/google";
import { getPublications } from "@/lib/publications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ fileId: string }> };

type AllowedCache = { expiresAt: number; ids: Set<string> };
let allowedCache: AllowedCache | null = null;

function safeName(name: string) {
  return name.replace(/[\r\n"]/g, "_");
}

function validFileId(fileId: string) {
  return /^[A-Za-z0-9_-]{10,}$/.test(fileId);
}

async function isAllowedFile(fileId: string) {
  const now = Date.now();
  if (!allowedCache || allowedCache.expiresAt < now) {
    const publications = await getPublications();
    const ids = new Set<string>();
    for (const publication of publications) {
      for (const document of publication.documents) {
        if (document.pdfFileId) ids.add(document.pdfFileId);
        if (document.mdFileId) ids.add(document.mdFileId);
      }
    }
    allowedCache = { ids, expiresAt: now + 60_000 };
  }
  return allowedCache.ids.has(fileId);
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { fileId } = await params;
  if (!validFileId(fileId)) return new Response("Archivo no válido.", { status: 400 });

  const disposition = request.nextUrl.searchParams.get("disposition") === "attachment" ? "attachment" : "inline";
  const range = request.headers.get("range");

  try {
    if (!(await isAllowedFile(fileId))) {
      return new Response("Archivo no publicado.", { status: 404 });
    }

    const [metadata, upstream] = await Promise.all([
      getDriveFileMetadata(fileId),
      fetchDriveFile(fileId, range),
    ]);

    if (!upstream.ok || !upstream.body) {
      return new Response("No se pudo descargar el archivo desde Google Drive.", {
        status: upstream.status || 502,
      });
    }

    const headers = new Headers();
    headers.set("Content-Type", metadata.mimeType || upstream.headers.get("content-type") || "application/octet-stream");
    headers.set("Content-Disposition", `${disposition}; filename="${safeName(metadata.name || fileId)}"`);
    headers.set("Cache-Control", "private, no-store");
    headers.set("Accept-Ranges", upstream.headers.get("accept-ranges") || "bytes");

    const contentLength = upstream.headers.get("content-length") || (range ? null : metadata.size);
    const contentRange = upstream.headers.get("content-range");
    if (contentLength) headers.set("Content-Length", contentLength);
    if (contentRange) headers.set("Content-Range", contentRange);

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Error leyendo Drive.", { status: 500 });
  }
}
