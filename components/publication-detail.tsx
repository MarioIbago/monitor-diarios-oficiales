"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Download,
  ExternalLink,
  FileDown,
  FileText,
  Link2,
  LoaderCircle,
  MapPin,
  Sparkles,
  Tag,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatGPTButton } from "@/components/chatgpt-button";
import type { Publication, PublicationDocument } from "@/lib/types";

type Tab = "analysis" | "pdf" | "markdown";

type AnalysisModel = {
  paragraphs: string[];
  bullets: string[];
  links: string[];
};

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

function meaningful(value: string) {
  const normalized = value.trim().toUpperCase();
  return Boolean(normalized && normalized !== "NO" && normalized !== "N/A" && normalized !== "NINGUNO");
}

function apiFileUrl(fileId: string | null, disposition: "inline" | "attachment" = "inline") {
  if (!fileId) return "";
  return `/api/files/${encodeURIComponent(fileId)}?disposition=${disposition}`;
}

function cleanUrlToken(value: string) {
  return value.replace(/[),.;]+$/g, "");
}

function unwrapGoogleRedirect(value: string) {
  let current = value;

  for (let index = 0; index < 3; index += 1) {
    try {
      const parsed = new URL(current);
      const isGoogleRedirect =
        (parsed.hostname === "google.com" || parsed.hostname === "www.google.com") &&
        parsed.pathname === "/url";

      if (!isGoogleRedirect) break;
      const next = parsed.searchParams.get("q") || parsed.searchParams.get("url");
      if (!next || next === current) break;
      current = next;
    } catch {
      break;
    }
  }

  return current;
}

function parseAnalysisText(value: string): AnalysisModel {
  if (!value.trim()) return { paragraphs: [], bullets: [], links: [] };

  const rawLinks = value.match(URL_PATTERN) || [];
  let text = value;

  rawLinks.forEach((raw) => {
    text = text.replace(raw, "");
  });

  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\s+-\s+/g, "\n- ")
    .replace(/\s*,\s*(?=\n|$)/g, "")
    .replace(/\n\s*y\s*(?=\n|$)/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !/^[,;:\s]+$/.test(line) && line.toLowerCase() !== "y");

  const paragraphs: string[] = [];
  const bullets: string[] = [];

  lines.forEach((line) => {
    if (/^[-•]\s+/.test(line)) {
      bullets.push(line.replace(/^[-•]\s+/, "").trim());
    } else {
      paragraphs.push(line);
    }
  });

  const links = Array.from(
    new Set(
      rawLinks
        .map(cleanUrlToken)
        .map(unwrapGoogleRedirect)
        .filter((link) => /^https?:\/\//i.test(link)),
    ),
  );

  return { paragraphs, bullets, links };
}

function splitList(value: string) {
  return value
    .split(/\n|;|,/)
    .map((item) => item.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean);
}

function AnalysisCopy({ model, fallback }: { model: AnalysisModel; fallback?: string }) {
  if (!model.paragraphs.length && !model.bullets.length) {
    return <p className="analysis-fallback">{fallback || "No hay información disponible."}</p>;
  }

  return (
    <div className="analysis-copy">
      {model.paragraphs.map((paragraph, index) => (
        <p key={`${paragraph}-${index}`}>{paragraph}</p>
      ))}
      {model.bullets.length > 0 && (
        <ul className="finding-list">
          {model.bullets.map((bullet, index) => (
            <li key={`${bullet}-${index}`}>
              <span className="finding-marker" aria-hidden="true" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReferenceLinks({ links }: { links: string[] }) {
  if (!links.length) return null;

  return (
    <div className="reference-panel">
      <div className="reference-heading">
        <Link2 size={16} />
        <span>Expedientes y referencias</span>
      </div>
      <div className="reference-links">
        {links.map((link, index) => (
          <a key={link} href={link} target="_blank" rel="noreferrer">
            <span>Expediente {index + 1}</span>
            <ExternalLink size={14} />
          </a>
        ))}
      </div>
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
    () =>
      ([
        ["Vivienda", publication.analysis.housing],
        ["Urbanismo", publication.analysis.urbanism],
        ["Infraestructura", publication.analysis.infrastructure],
        ["Construcción", publication.analysis.construction],
        ["Uso de suelo", publication.analysis.landUse],
        ["Permisos y licencias", publication.analysis.permits],
        ["Movilidad", publication.analysis.mobility],
      ] as const).filter(([, value]) => meaningful(value)),
    [publication.analysis],
  );

  const summaryModel = useMemo(
    () => parseAnalysisText(publication.analysis.summary),
    [publication.analysis.summary],
  );
  const changesModel = useMemo(
    () => parseAnalysisText(publication.analysis.changes),
    [publication.analysis.changes],
  );
  const historyModel = useMemo(
    () => parseAnalysisText(publication.analysis.historicalComparison),
    [publication.analysis.historicalComparison],
  );
  const municipalities = useMemo(
    () => splitList(publication.analysis.municipalities),
    [publication.analysis.municipalities],
  );
  const agencies = useMemo(
    () => splitList(publication.analysis.agencies),
    [publication.analysis.agencies],
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
        <section className="analysis-layout analysis-layout-refined">
          <div className="analysis-primary analysis-primary-refined">
            <section className="analysis-card executive-summary-card">
              <div className="analysis-card-heading">
                <span>Lectura rápida</span>
                <h2>Resumen ejecutivo</h2>
                <p>Los puntos centrales de esta publicación, sin enlaces largos ni texto técnico innecesario.</p>
              </div>
              <AnalysisCopy
                model={summaryModel}
                fallback="El análisis todavía no está disponible."
              />
              <ReferenceLinks links={summaryModel.links} />
            </section>

            {publication.analysis.changes && (
              <section className="analysis-card">
                <div className="analysis-card-heading compact">
                  <span>Qué cambió</span>
                  <h2>Cambios y hallazgos</h2>
                </div>
                <AnalysisCopy model={changesModel} />
                <ReferenceLinks links={changesModel.links} />
              </section>
            )}

            {publication.analysis.historicalComparison && (
              <section className="analysis-card">
                <div className="analysis-card-heading compact">
                  <span>Contexto</span>
                  <h2>Comparación histórica</h2>
                </div>
                <AnalysisCopy model={historyModel} />
                <ReferenceLinks links={historyModel.links} />
              </section>
            )}
          </div>

          <aside className="analysis-aside analysis-aside-refined">
            {topics.length > 0 && (
              <section className="insight-card">
                <div className="insight-title">
                  <Tag size={16} />
                  <h3>Temas detectados</h3>
                </div>
                <div className="topic-chips">
                  {topics.map(([label]) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
              </section>
            )}

            {municipalities.length > 0 && (
              <section className="insight-card">
                <div className="insight-title">
                  <MapPin size={16} />
                  <h3>Municipios</h3>
                </div>
                <div className="municipality-chips">
                  {municipalities.map((municipality) => (
                    <span key={municipality}>{municipality}</span>
                  ))}
                </div>
              </section>
            )}

            {agencies.length > 0 && (
              <section className="insight-card">
                <div className="insight-title">
                  <Building2 size={16} />
                  <h3>Dependencias</h3>
                </div>
                <ul className="agency-list">
                  {agencies.map((agency, index) => (
                    <li key={`${agency}-${index}`}>{agency}</li>
                  ))}
                </ul>
              </section>
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
