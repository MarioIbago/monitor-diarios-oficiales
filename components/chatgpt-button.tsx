"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import type { Publication } from "@/lib/types";

function buildPrompt(publication: Publication) {
  const files = publication.documents
    .map(
      (document, index) => `DOCUMENTO ${index + 1}: ${document.name}\nPDF: ${document.pdfDriveUrl || "No disponible"}\nMarkdown: ${document.mdDriveUrl || "No disponible"}`,
    )
    .join("\n\n");

  return `Analiza exhaustivamente los siguientes archivos correspondientes a una publicación de un Diario Oficial.\n\nPUBLICACIÓN:\n- Fuente: ${publication.sourceLabel}\n- Fecha: ${publication.date}\n- Edición/Número: ${publication.edition}\n- Documento ID: ${publication.documents.map((document) => document.id).join(", ")}\n\nARCHIVOS:\n\n${files}\n\nINSTRUCCIONES:\n1. Abre y lee el/los archivos Markdown completos.\n2. Si tienes acceso al PDF, úsalo para verificar tablas, anexos, imágenes, encabezados e información que pueda haberse perdido durante la conversión a Markdown.\n3. Usa estos archivos como contexto de esta conversación para mis preguntas posteriores sobre esta publicación.\n4. No inventes información que no aparezca en los documentos.\n5. Si una URL no es accesible, indícalo claramente.\n6. Da prioridad a vivienda, desarrollo inmobiliario, desarrollo urbano, construcción, uso de suelo, fraccionamientos, desarrolladores, adquisición o disposición de terrenos, reservas territoriales, permisos, licencias, infraestructura, subsidios, programas gubernamentales, decretos, acuerdos, expropiaciones, zonificación, catastros, impuestos o derechos inmobiliarios, INFONAVIT, FOVISSSTE, SEDATU, CONAVI y cualquier disposición con impacto potencial en el sector vivienda.\n7. Para cada hallazgo indica: asunto, autoridad, resumen, qué cambió, relevancia para vivienda, implicaciones y ubicación en el documento cuando sea posible.\n8. Clasifica los hallazgos en RELEVANCIA ALTA, MEDIA o BAJA.\n9. Si no hay hallazgos materiales, escribe exactamente: “NO SE IDENTIFICARON HALLAZGOS MATERIALES PARA EL SECTOR VIVIENDA.”\n10. Después del análisis, conserva estos documentos como contexto de esta conversación para preguntas posteriores.\n\nComienza leyendo los archivos completos antes de responder.`;
}

export function ChatGPTButton({ publication }: { publication: Publication }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    try {
      await navigator.clipboard.writeText(buildPrompt(publication));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className="chatgpt-button" type="button" onClick={handleClick}>
      {copied ? <Check size={17} /> : <Sparkles size={17} />}
      {copied ? "Prompt copiado" : "Analizar con ChatGPT"}
    </button>
  );
}
