import type { Publication } from "@/lib/types";

function documentLabel(part: string, index: number) {
  return part ? `Parte ${part}` : `Documento ${index + 1}`;
}

/**
 * Construye un prompt determinista para ChatGPT.
 *
 * Regla principal: todos los Markdown/OCR de la publicación se comparten con
 * ChatGPT. El PDF sólo se usa como respaldo cuando una parte todavía no tiene
 * Markdown disponible.
 */
export function buildPublicationChatPrompt(publication: Publication) {
  const files = publication.documents.map((document, index) => {
    const primaryUrl = document.mdDriveUrl || document.pdfDriveUrl || document.sourceUrl;
    const primaryKind = document.mdDriveUrl
      ? "Markdown/OCR"
      : document.pdfDriveUrl
        ? "PDF (respaldo: no hay Markdown)"
        : "Fuente oficial (respaldo)";

    return [
      `${documentLabel(document.part, index)} · ${document.name}`,
      `Documento ID: ${document.id}`,
      primaryUrl ? `${primaryKind}: ${primaryUrl}` : "Sin enlace disponible",
    ].join("\n");
  });

  return [
    "Analiza esta publicación oficial usando TODOS los archivos enlazados abajo.",
    "",
    "DATOS",
    `Fuente: ${publication.sourceLabel}`,
    `Fecha: ${publication.date}`,
    `Edición/Número: ${publication.edition}`,
    `Total de documentos: ${publication.documents.length}`,
    "",
    "ARCHIVOS",
    files.length ? files.join("\n\n") : "No hay archivos disponibles.",
    "",
    "REGLAS",
    "1. Lee todos los archivos Markdown/OCR antes de responder.",
    "2. Trata todas las partes como una sola publicación y no omitas ninguna.",
    "3. Si una parte no tiene Markdown, usa únicamente para esa parte el PDF o la fuente oficial de respaldo.",
    "4. No sustituyas un Markdown disponible por su PDF.",
    "5. Identifica cambios, disposiciones, fechas, autoridades, obligaciones, municipios, permisos, infraestructura, movilidad, construcción, urbanismo, vivienda y uso de suelo cuando estén sustentados por los documentos.",
    "6. Distingue hechos del documento de inferencias. No inventes información.",
    "7. Cuando un hallazgo provenga de una parte específica, indica la parte o el nombre del archivo.",
    "8. Si algún enlace no es accesible, identifica exactamente cuál y continúa con los demás.",
    "",
    "Empieza confirmando cuántos archivos pudiste abrir y luego presenta el análisis consolidado.",
  ].join("\n");
}

export function buildPublicationChatUrl(publication: Publication) {
  const params = new URLSearchParams({ q: buildPublicationChatPrompt(publication) });
  return `https://chatgpt.com/?${params.toString()}`;
}
