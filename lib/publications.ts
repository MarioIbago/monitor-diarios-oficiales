import "server-only";
import { getSheetValues } from "@/lib/google";
import type {
  Publication,
  PublicationAnalysis,
  PublicationDocument,
  SourceKey,
} from "@/lib/types";

const EMPTY_ANALYSIS: PublicationAnalysis = {
  relevant: "",
  mobility: "",
  construction: "",
  urbanism: "",
  infrastructure: "",
  housing: "",
  landUse: "",
  permits: "",
  municipalities: "",
  agencies: "",
  summary: "",
  changes: "",
  modifiesPrevious: "",
  historicalComparison: "",
};

function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return [];
  const [headers, ...body] = rows;
  return body
    .filter((row) => row.some((value) => String(value ?? "").trim()))
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? "").trim()])),
    );
}

function splitCsv(value: string): string[] {
  return value
    .split(/\s*,\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeDate(value: string): string {
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const latin = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (latin) {
    return `${latin[3]}-${latin[2].padStart(2, "0")}-${latin[1].padStart(2, "0")}`;
  }
  return text;
}

function driveFileId(url: string): string | null {
  if (!url) return null;
  const direct = url.match(/\/d\/([^/?#]+)/);
  if (direct?.[1]) return direct[1];
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("id");
  } catch {
    return null;
  }
}

function sourceLabel(source: SourceKey) {
  if (source === "dof") return "Diario Oficial de la Federación";
  if (source === "nuevo_leon") return "Periódico Oficial de Nuevo León";
  return source || "Diario oficial";
}

function publicationKey(documentId: string): string {
  const id = documentId.trim();
  const parts = id.split(":");
  if (parts[0] === "nuevo_leon" && parts.length >= 3) return parts.slice(0, 3).join(":");
  if (parts[0] === "dof" && parts.length >= 3) return parts.slice(0, 3).join(":");
  return id.replace(/:parte:\d+$/i, "").replace(/:completo$/i, "");
}

function editionFromKey(id: string, source: SourceKey): string {
  const tail = id.split(":")[2] ?? "";
  if (source === "nuevo_leon") return tail ? `Número ${tail}` : "Periódico oficial";
  if (tail === "MAT") return "Edición matutina";
  if (tail === "VES") return "Edición vespertina";
  return tail ? `Edición ${tail}` : "Edición oficial";
}

function dateFromDocumentId(id: string): string {
  return normalizeDate(id.split(":")[1] ?? "");
}

function maxIso(values: string[]) {
  return values.filter(Boolean).sort().at(-1) ?? "";
}

function normalizeStatus(statuses: string[]) {
  const normalized = statuses.map((status) => status.trim().toUpperCase()).filter(Boolean);
  if (normalized.includes("PENDIENTE")) return "PENDIENTE";
  if (normalized.includes("ENVIADO")) return "ENVIADO";
  if (normalized.includes("COMPLETADO")) return "COMPLETADO";
  return "PENDIENTE";
}

function documentFromMonitor(row: Record<string, string>): PublicationDocument {
  return {
    id: row["Documento ID"] ?? "",
    name: row["Nombre base"] || row["Documento ID"] || "Documento",
    part: row["Parte"] || "",
    pdfFileId: row["PDF File ID"] || driveFileId(row["PDF Drive"] || ""),
    pdfDriveUrl: row["PDF Drive"] || "",
    mdFileId: row["MD File ID"] || driveFileId(row["MD Drive"] || ""),
    mdDriveUrl: row["MD Drive"] || "",
    sourceUrl: row["URL origen"] || "",
    sha256: row["SHA256"] || "",
  };
}

function analysisFromRow(row: Record<string, string>): PublicationAnalysis {
  return {
    relevant: row["Relevante"] || "",
    mobility: row["Movilidad"] || "",
    construction: row["Construccion"] || "",
    urbanism: row["Urbanismo"] || "",
    infrastructure: row["Infraestructura"] || "",
    housing: row["Vivienda"] || "",
    landUse: row["Uso de suelo"] || "",
    permits: row["Permisos y licencias"] || "",
    municipalities: row["Municipios"] || "",
    agencies: row["Dependencias"] || "",
    summary: row["Resumen"] || "",
    changes: row["Cambios"] || "",
    modifiesPrevious: row["Modifica publicaciones anteriores"] || "",
    historicalComparison: row["Comparacion historica"] || "",
  };
}

function documentsFromAnalysis(
  row: Record<string, string>,
  indices?: number[],
): PublicationDocument[] {
  const ids = splitCsv(row["Documento ID"] || "");
  const names = splitCsv(row["Nombre base"] || "");
  const pdfs = splitCsv(row["PDF Drive"] || "");
  const mds = splitCsv(row["MD Drive"] || "");
  const selected = indices ?? ids.map((_, index) => index);

  return selected.map((index) => {
    const id = ids[index] || "";
    return {
      id,
      name: names[index] || id || `Documento ${index + 1}`,
      part: id.match(/:parte:(\d+)$/i)?.[1] ?? "",
      pdfFileId: driveFileId(pdfs[index] || ""),
      pdfDriveUrl: pdfs[index] || "",
      mdFileId: driveFileId(mds[index] || ""),
      mdDriveUrl: mds[index] || "",
      sourceUrl: "",
      sha256: "",
    };
  }).filter((document) => document.id);
}

function dedupeDocuments(documents: PublicationDocument[]) {
  const map = new Map<string, PublicationDocument>();
  for (const document of documents) {
    const previous = map.get(document.id);
    map.set(document.id, {
      ...previous,
      ...document,
      pdfFileId: document.pdfFileId || previous?.pdfFileId || null,
      mdFileId: document.mdFileId || previous?.mdFileId || null,
      pdfDriveUrl: document.pdfDriveUrl || previous?.pdfDriveUrl || "",
      mdDriveUrl: document.mdDriveUrl || previous?.mdDriveUrl || "",
      sourceUrl: document.sourceUrl || previous?.sourceUrl || "",
      sha256: document.sha256 || previous?.sha256 || "",
    });
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function getPublications(): Promise<Publication[]> {
  const monitorTab = process.env.GOOGLE_SHEET_MONITOR_TAB?.trim() || "Monitor";
  const analysisTab = process.env.GOOGLE_SHEET_ANALYSIS_TAB?.trim() || "Analisis";

  const [monitorRows, analysisRows] = await Promise.all([
    getSheetValues(`'${monitorTab.replaceAll("'", "''")}'!A:R`),
    getSheetValues(`'${analysisTab.replaceAll("'", "''")}'!A:X`),
  ]);

  const monitor = rowsToObjects(monitorRows);
  const analyses = rowsToObjects(analysisRows);

  const publications = new Map<string, Publication>();

  for (const row of monitor) {
    const documentId = row["Documento ID"] || "";
    if (!documentId) continue;
    const key = publicationKey(documentId);
    const source = row["Fuente"] || documentId.split(":")[0] || "";
    const existing = publications.get(key);
    const document = documentFromMonitor(row);
    const updatedAt = row["Actualizado UTC"] || row["Verificado UTC"] || "";

    publications.set(key, {
      id: key,
      source,
      sourceLabel: sourceLabel(source),
      date: normalizeDate(row["Fecha"] || dateFromDocumentId(documentId)),
      edition: editionFromKey(key, source),
      status: normalizeStatus([existing?.status || "", row["IA Estado"] || "PENDIENTE"]),
      updatedAt: maxIso([existing?.updatedAt || "", updatedAt]),
      documents: dedupeDocuments([...(existing?.documents ?? []), document]),
      analysis: existing?.analysis ?? EMPTY_ANALYSIS,
    });
  }

  // Analisis puede contener filas incrementales (parte 01, luego 01+02, etc.)
  // e incluso bundles con publicaciones distintas. Separamos cada bundle por
  // publicationKey y para cada publicación elegimos el subconjunto más completo.
  const bestAnalysis = new Map<
    string,
    { row: Record<string, string>; indices: number[]; score: number; order: number }
  >();

  analyses.forEach((row, order) => {
    const ids = splitCsv(row["Documento ID"] || "");
    if (!ids.length) return;

    const grouped = new Map<string, number[]>();
    ids.forEach((id, index) => {
      const key = publicationKey(id);
      grouped.set(key, [...(grouped.get(key) ?? []), index]);
    });

    for (const [key, indices] of grouped) {
      const score = indices.length;
      const current = bestAnalysis.get(key);
      if (!current || score > current.score || (score === current.score && order > current.order)) {
        bestAnalysis.set(key, { row, indices, score, order });
      }
    }
  });

  for (const [key, selection] of bestAnalysis) {
    const row = selection.row;
    const ids = splitCsv(row["Documento ID"] || "");
    const sources = splitCsv(row["Fuente"] || "");
    const dates = splitCsv(row["Fecha"] || "").map(normalizeDate);
    const firstIndex = selection.indices[0] ?? 0;
    const firstId = ids[firstIndex] || key;
    const source = (sources[firstIndex] || firstId.split(":")[0] || "") as SourceKey;
    const existing = publications.get(key);
    const analysisStatus = (row["Analizado IA"] || "").trim().toUpperCase();
    const status = analysisStatus === "COMPLETADO"
      ? "COMPLETADO"
      : normalizeStatus([existing?.status || "", analysisStatus || "PENDIENTE"]);

    publications.set(key, {
      id: key,
      source,
      sourceLabel: sourceLabel(source),
      date: dates[firstIndex] || existing?.date || dateFromDocumentId(firstId),
      edition: existing?.edition || editionFromKey(key, source),
      status,
      updatedAt: row["Actualizado UTC"] || existing?.updatedAt || "",
      documents: dedupeDocuments([
        ...(existing?.documents ?? []),
        ...documentsFromAnalysis(row, selection.indices),
      ]),
      analysis: analysisFromRow(row),
    });
  }

  return [...publications.values()].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate) return byDate;
    return a.sourceLabel.localeCompare(b.sourceLabel, "es");
  });
}

export async function getPublication(id: string) {
  const publications = await getPublications();
  return publications.find((publication) => publication.id === id) ?? null;
}
