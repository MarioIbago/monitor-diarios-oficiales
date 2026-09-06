"use client";

import { ExternalLink } from "lucide-react";
import type { Publication } from "@/lib/types";

function buildPrompt(publication: Publication) {
  const files = publication.documents
    .map((document, index) => {
      const links = [
        document.mdDriveUrl ? `Markdown: ${document.mdDriveUrl}` : null,
        document.pdfDriveUrl ? `PDF: ${document.pdfDriveUrl}` : null,
        document.sourceUrl ? `Fuente oficial: ${document.sourceUrl}` : null,
      ].filter(Boolean);

      return [`DOCUMENTO ${index + 1}: ${document.name}`, ...links].join("\n");
    })
    .join("\n\n");

  return [
    "Analiza esta publicación oficial usando los archivos enlazados como fuente principal.",
    "",
    "PUBLICACIÓN",
    `Fuente: ${publication.sourceLabel}`,
    `Fecha: ${publication.date}`,
    `Edición/Número: ${publication.edition}`,
    `Documento ID: ${publication.documents.map((document) => document.id).join(", ")}`,
    "",
    "ARCHIVOS",
    files || "No hay enlaces disponibles.",
    "",
    "INSTRUCCIONES",
    "1. Abre y lee primero cada archivo Markdown disponible.",
    "2. Usa el PDF o la fuente oficial para verificar tablas, anexos, imágenes o información que pueda perderse en Markdown.",
    "3. Resume los cambios, disposiciones, fechas, autoridades, obligaciones e implicaciones relevantes.",
    "4. Señala en qué documento, sección o encabezado aparece cada hallazgo cuando sea posible.",
    "5. No inventes información que no esté sustentada por los archivos.",
    "6. Si un enlace no es accesible, indícalo claramente y continúa con los demás archivos disponibles.",
    "7. Mantén estos documentos como contexto para mis siguientes preguntas en esta conversación.",
    "",
    "Empieza leyendo los archivos completos antes de responder.",
  ].join("\n");
}

function buildChatGPTUrl(publication: Publication) {
  const params = new URLSearchParams({ q: buildPrompt(publication) });
  return `https://chatgpt.com/?${params.toString()}`;
}

export function ChatGPTButton({ publication }: { publication: Publication }) {
  return (
    <a
      className="chatgpt-button"
      href={buildChatGPTUrl(publication)}
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir ChatGPT con el prompt y los enlaces de esta publicación"
    >
      <ExternalLink size={17} />
      Abrir en ChatGPT
    </a>
  );
}
