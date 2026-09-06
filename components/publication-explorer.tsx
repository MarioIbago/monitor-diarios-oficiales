"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, FileText, Search, Sparkles } from "lucide-react";
import type { Publication } from "@/lib/types";

function dateLabel(date: string) {
  if (!date) return "Fecha no disponible";
  const value = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(value.getTime())) return date;
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

function isYes(value: string) {
  return /^(si|sí|yes|true|1)$/i.test(value.trim());
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function PublicationExplorer({ publications }: { publications: Publication[] }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"all" | "dof" | "nuevo_leon">("all");
  const [status, setStatus] = useState<"all" | "COMPLETADO" | "PENDIENTE">("all");

  const filtered = useMemo(() => {
    const q = normalized(query.trim());
    return publications.filter((publication) => {
      if (source !== "all" && publication.source !== source) return false;
      if (status === "COMPLETADO" && publication.status !== "COMPLETADO") return false;
      if (status === "PENDIENTE" && publication.status === "COMPLETADO") return false;
      if (!q) return true;

      const text = normalized(
        [
          publication.sourceLabel,
          publication.date,
          publication.edition,
          publication.analysis.summary,
          publication.analysis.changes,
          publication.analysis.municipalities,
          publication.analysis.agencies,
          publication.analysis.housing,
          publication.analysis.urbanism,
          publication.analysis.infrastructure,
          publication.analysis.landUse,
          publication.analysis.permits,
        ].join(" "),
      );
      return text.includes(q);
    });
  }, [publications, query, source, status]);

  return (
    <main className="shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Inicio">
          <span className="brand-mark">D</span>
          <span>
            <strong>Diarios Oficiales</strong>
            <small>DOF · Nuevo León</small>
          </span>
        </Link>
        <div className="header-note">Consulta y análisis para vivienda</div>
      </header>

      <section className="intro">
        <h1>Lo publicado, explicado.</h1>
        <p>
          Consulta el documento oficial, su versión OCR en Markdown y el análisis generado sobre
          vivienda, urbanismo e infraestructura.
        </p>
      </section>

      <section className="toolbar" aria-label="Filtros de publicaciones">
        <label className="search-box">
          <Search size={19} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar tema, municipio, dependencia…"
            aria-label="Buscar publicaciones"
          />
        </label>

        <div className="filter-row">
          <div className="segmented" aria-label="Filtrar por fuente">
            {([
              ["all", "Todos"],
              ["dof", "DOF"],
              ["nuevo_leon", "Nuevo León"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={source === value ? "active" : ""}
                onClick={() => setSource(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="all">Todos los estados</option>
            <option value="COMPLETADO">Análisis completado</option>
            <option value="PENDIENTE">En proceso</option>
          </select>
        </div>
      </section>

      <div className="results-heading">
        <span>{filtered.length} publicaciones</span>
        <span>Más recientes primero</span>
      </div>

      <section className="publication-list">
        {filtered.map((publication) => {
          const relevant = isYes(publication.analysis.relevant);
          const complete = publication.status === "COMPLETADO";
          return (
            <article className="publication-row" key={publication.id}>
              <div className="date-column">
                <span>{dateLabel(publication.date)}</span>
              </div>

              <div className="publication-main">
                <div className="publication-meta">
                  <span>{publication.sourceLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span>{publication.edition}</span>
                </div>

                <h2>
                  {relevant ? "Hallazgos relevantes para el sector" : "Publicación oficial disponible"}
                </h2>

                <p className="summary">
                  {publication.analysis.summary ||
                    (complete
                      ? "El análisis fue completado. Abre la publicación para consultar el detalle."
                      : "El documento ya está disponible y el análisis de IA continúa en proceso.")}
                </p>

                <div className="row-footer">
                  <span className={`status ${complete ? "complete" : "pending"}`}>
                    {complete ? <Sparkles size={14} /> : <FileText size={14} />}
                    {complete ? "Análisis completado" : "Análisis en proceso"}
                  </span>
                  {relevant && <span className="relevant-label">Relevante para vivienda</span>}
                </div>
              </div>

              <Link className="open-button" href={`/publicaciones/${publication.id}`}>
                Abrir
                <ArrowUpRight size={17} />
              </Link>
            </article>
          );
        })}

        {!filtered.length && (
          <div className="empty-state">
            <Search size={26} />
            <h2>No encontré publicaciones con esos filtros.</h2>
            <p>Prueba otra palabra o cambia la fuente seleccionada.</p>
          </div>
        )}
      </section>
    </main>
  );
}
