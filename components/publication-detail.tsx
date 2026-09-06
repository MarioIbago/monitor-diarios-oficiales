"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Download,
  ExternalLink,
  FileDown,
  FileText,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatGPTButton } from "@/components/chatgpt-button";
import type { Publication, PublicationDocument } from "@/lib/types";

type Tab = "analysis" | "pdf" | "markdown";

function meaningful(value: string) {
  const normalized = value.trim().toUpperCase();
  return Boolean(normalized && normalized !== "NO" && normalized !== "N/A" && normalized !== "NINGUNO");
}

function apiFileUrl(fileId: string | null, disposition: "inline" | "attachment" = "inline") {
  if (!fileId) return "";
  return `/api/files/${encodeURIComponent(fileId)}?disposition=${disposition}`;
}

function Topic({ label, value }: { label: string; value: string }) {
  if (!meaningful(value)) return null;
  return (
    <div className="topic-block">
      <span>{label}</span>
      <p>{value}</p>
    </div>
  );
}

export function PublicationDetail({ publication }: { publication: Publication }) {
  const [tab, setTab] = useState<Tab>("analysis");
  const [documentIndex, setDocumentIndex] = useState(0);
  const [markdown, setMarkdown] = useState("");
  const [markdownState, setMarkdownState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const document = publication.documents[documentIndex] as PublicationDocument | undefined;

  const topics = useMemo(
    () => [
      ["Vivienda", publication.analysis.housing],
      ["Urbanismo", publication.analysis.urbanism],
      ["Infraestructura", publication.analysis.infrastructure],
      ["Construcción", publication.analysis.construction],
      ["Uso de suelo", publication.analysis.landUse],
      ["Permisos y licencias", publication.analysis.permits],
      ["Movilidad", publication.analysis.mobility],
    ] as const,
    [publication.analysis],
  );

  useEffect(() => {
    setMarkdown("");
    setMarkdownState("idle");
  }, [document?.mdFileId]);

  useEffect(() => {
    if (tab !== "markdown" || !document?.mdFileId || markdownState !== "idle") return;
    const controller = new AbortController();
    setMarkdownState("loading");
    fetch(apiFileUrl(document.mdFileId), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudo cargar el Markdown");
        return response.text();
      })
      .then((text) => {
        if (controller.signal.aborted) return;
        setMarkdown(text);
        setMarkdownState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setMarkdownState("error");
      });
    return () => controller.abort();
  }, [tab, document?.mdFileId, markdownState]);

  return (
    <>
      <div className="detail-actions">
        <ChatGPTButton publication={publication} />
        {document?.pdfFileId && (
          <a className="secondary-button" href={apiFileUrl(document.pdfFileId, "attachment")}>
            <Download size={17} /> Descargar PDF
          </a>
        )}
        {document?.mdFileId && (
          <a className="secondary-button" href={apiFileUrl(document.mdFileId, "attachment")}>
            <FileDown size={17} /> Descargar MD
          </a>
        )}
      </div>

      {publication.documents.length > 1 && (
        <div className="document-switcher" aria-label="Partes de la publicación">
          {publication.documents.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={index === documentIndex ? "active" : ""}
              onClick={() => setDocumentIndex(index)}
            >
              {item.part ? `Parte ${item.part}` : `Documento ${index + 1}`}
            </button>
          ))}
        </div>
      )}

      <div className="detail-tabs" role="tablist">
        <button className={tab === "analysis" ? "active" : ""} onClick={() => setTab("analysis")}>
          <Sparkles size={17} /> Análisis
        </button>
        <button className={tab === "pdf" ? "active" : ""} onClick={() => setTab("pdf")}>
          <FileText size={17} /> PDF
        </button>
        <button className={tab === "markdown" ? "active" : ""} onClick={() => setTab("markdown")}>
          <FileDown size={17} /> Markdown
        </button>
      </div>

      {tab === "analysis" && (
        <section className="analysis-layout">
          <div className="analysis-primary">
            <section className="content-section">
              <h2>Resumen</h2>
              <div className="prose-text">
                {publication.analysis.summary || "El análisis todavía no está disponible."}
              </div>
            </section>

            {publication.analysis.changes && (
              <section className="content-section">
                <h2>Cambios detectados</h2>
                <div className="prose-text">{publication.analysis.changes}</div>
              </section>
            )}

            {publication.analysis.historicalComparison && (
              <section className="content-section">
                <h2>Comparación histórica</h2>
                <div className="prose-text">{publication.analysis.historicalComparison}</div>
              </section>
            )}
          </div>

          <aside className="analysis-aside">
            <div className="aside-section">
              <h3>Temas detectados</h3>
              {topics.map(([label, value]) => (
                <Topic key={label} label={label} value={value} />
              ))}
            </div>
            {publication.analysis.municipalities && (
              <div className="aside-section">
                <h3>Municipios</h3>
                <p className="preline">{publication.analysis.municipalities}</p>
              </div>
            )}
            {publication.analysis.agencies && (
              <div className="aside-section">
                <h3>Dependencias</h3>
                <p className="preline">{publication.analysis.agencies}</p>
              </div>
            )}
          </aside>
        </section>
      )}

      {tab === "pdf" && (
        <section className="viewer-section">
          <div className="viewer-toolbar">
            <span>{document?.name || "Documento PDF"}</span>
            <div>
              {document?.pdfDriveUrl && (
                <a href={document.pdfDriveUrl} target="_blank" rel="noreferrer">
                  Drive <ExternalLink size={15} />
                </a>
              )}
              {document?.sourceUrl && (
                <a href={document.sourceUrl} target="_blank" rel="noreferrer">
                  Fuente oficial <ExternalLink size={15} />
                </a>
              )}
            </div>
          </div>
          {document?.pdfFileId ? (
            <iframe
              className="pdf-frame"
              src={apiFileUrl(document.pdfFileId)}
              title={`PDF ${document.name}`}
            />
          ) : (
            <div className="viewer-empty">No hay un PDF disponible para previsualizar.</div>
          )}
        </section>
      )}

      {tab === "markdown" && (
        <section className="viewer-section markdown-viewer">
          <div className="viewer-toolbar">
            <span>{document?.name || "Documento"}.md</span>
            {document?.mdDriveUrl && (
              <a href={document.mdDriveUrl} target="_blank" rel="noreferrer">
                Abrir en Drive <ExternalLink size={15} />
              </a>
            )}
          </div>
          {!document?.mdFileId && <div className="viewer-empty">No hay Markdown disponible.</div>}
          {markdownState === "loading" && (
            <div className="viewer-empty">
              <LoaderCircle className="spin" size={22} /> Cargando Markdown…
            </div>
          )}
          {markdownState === "error" && (
            <div className="viewer-empty">No se pudo cargar este Markdown desde Drive.</div>
          )}
          {markdownState === "ready" && (
            <article className="markdown-prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
            </article>
          )}
        </section>
      )}
    </>
  );
}
