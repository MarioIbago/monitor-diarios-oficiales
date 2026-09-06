"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Landmark,
  LayoutDashboard,
  Menu,
  Newspaper,
  Search,
  X,
} from "lucide-react";
import type { Publication } from "@/lib/types";

type SourceFilter = "all" | "dof" | "nuevo_leon";
type StatusFilter = "all" | "COMPLETADO" | "ENVIADO" | "PENDIENTE";

function dateLabel(date: string) {
  if (!date) return "Fecha no disponible";
  const value = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(value.getTime())) return date;
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

function syncLabel(value: string) {
  if (!value) return "Sin registro";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Monterrey",
  }).format(date);
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function statusLabel(status: string) {
  if (status === "COMPLETADO") return "Completado";
  if (status === "ENVIADO") return "Enviado";
  if (status === "PENDIENTE") return "Pendiente";
  return status || "Sin estado";
}

function getLatestDate(publications: Publication[]) {
  return publications.reduce((latest, publication) => {
    if (!publication.date) return latest;
    return publication.date > latest ? publication.date : latest;
  }, "");
}

function getLatestSync(publications: Publication[]) {
  let latest = "";
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const publication of publications) {
    const parsed = Date.parse(publication.updatedAt);
    if (!Number.isNaN(parsed) && parsed > latestTime) {
      latestTime = parsed;
      latest = publication.updatedAt;
    }
  }

  return latest;
}

export function PublicationExplorer({ publications }: { publications: Publication[] }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [date, setDate] = useState("");
  const [edition, setEdition] = useState("all");
  const [menuOpen, setMenuOpen] = useState(false);

  const latestDate = useMemo(() => getLatestDate(publications), [publications]);
  const latestSync = useMemo(() => getLatestSync(publications), [publications]);

  const editions = useMemo(
    () =>
      Array.from(new Set(publications.map((publication) => publication.edition).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, "es", { numeric: true }),
      ),
    [publications],
  );

  const metrics = useMemo(() => {
    const latestCount = latestDate
      ? publications.filter((publication) => publication.date === latestDate).length
      : 0;
    const pending = publications.filter((publication) => publication.status !== "COMPLETADO").length;
    const completed = publications.filter((publication) => publication.status === "COMPLETADO").length;
    const sources = new Set(publications.map((publication) => publication.source).filter(Boolean)).size;

    return { latestCount, pending, completed, sources };
  }, [publications, latestDate]);

  const filtered = useMemo(() => {
    const q = normalized(query.trim());

    return publications.filter((publication) => {
      if (source !== "all" && publication.source !== source) return false;
      if (status !== "all" && publication.status !== status) return false;
      if (date && publication.date !== date) return false;
      if (edition !== "all" && publication.edition !== edition) return false;
      if (!q) return true;

      const text = normalized(
        [
          publication.sourceLabel,
          publication.date,
          publication.edition,
          publication.status,
          publication.analysis.summary,
          publication.analysis.changes,
          publication.analysis.municipalities,
          publication.analysis.agencies,
          ...publication.documents.map((document) => document.name),
        ].join(" "),
      );

      return text.includes(q);
    });
  }, [publications, query, source, status, date, edition]);

  function closeMenu() {
    setMenuOpen(false);
  }

  function resetFilters() {
    setQuery("");
    setSource("all");
    setStatus("all");
    setDate("");
    setEdition("all");
    closeMenu();
  }

  function selectSource(value: SourceFilter) {
    setSource(value);
    setStatus("all");
    closeMenu();
    document.getElementById("publications")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showPending() {
    setStatus("PENDIENTE");
    closeMenu();
    document.getElementById("publications")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const kpis = [
    {
      label: "Último corte",
      value: metrics.latestCount,
      detail: latestDate ? dateLabel(latestDate) : "Sin publicaciones",
      icon: Newspaper,
      tone: "blue",
    },
    {
      label: "Por revisar",
      value: metrics.pending,
      detail: "Pendientes o enviados",
      icon: Clock3,
      tone: "amber",
    },
    {
      label: "Completadas",
      value: metrics.completed,
      detail: `${publications.length} registros totales`,
      icon: CheckCircle2,
      tone: "green",
    },
    {
      label: "Sistema",
      value: "En línea",
      detail: `${metrics.sources} fuentes conectadas`,
      icon: Activity,
      tone: "green",
    },
  ] as const;

  return (
    <div className="dashboard-shell">
      <aside className={`dashboard-sidebar ${menuOpen ? "open" : ""}`} aria-label="Navegación principal">
        <div className="dashboard-brand">
          <span className="dashboard-brand-mark" aria-hidden="true">D</span>
          <span>
            <strong>Diarios Oficiales</strong>
            <small>Monitor institucional</small>
          </span>
        </div>

        <nav className="dashboard-nav">
          <span className="nav-section-label">Monitoreo</span>
          <button type="button" className={source === "all" && status === "all" ? "active" : ""} onClick={resetFilters}>
            <LayoutDashboard size={20} />
            Inicio
          </button>
          <button type="button" className={source === "dof" ? "active" : ""} onClick={() => selectSource("dof")}>
            <Landmark size={20} />
            DOF
          </button>
          <button type="button" className={source === "nuevo_leon" ? "active" : ""} onClick={() => selectSource("nuevo_leon")}>
            <Building2 size={20} />
            Periódico Oficial NL
          </button>
          <a href="#publications" onClick={closeMenu}>
            <Newspaper size={20} />
            Publicaciones
          </a>

          <span className="nav-section-label secondary">Seguimiento</span>
          <button type="button" className={status === "PENDIENTE" ? "active" : ""} onClick={showPending}>
            <Clock3 size={20} />
            Pendientes
            {metrics.pending > 0 ? <span className="nav-count">{metrics.pending}</span> : null}
          </button>
        </nav>

        <div className="sidebar-footer">
          <span className="system-dot" aria-hidden="true" />
          <span>
            <strong>Sistema operativo</strong>
            <small>Última sinc. {syncLabel(latestSync)}</small>
          </span>
        </div>
      </aside>

      {menuOpen ? (
        <button className="sidebar-overlay" type="button" aria-label="Cerrar menú" onClick={closeMenu} />
      ) : null}

      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu-button"
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            >
              {menuOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
            <div>
              <strong>Monitor de Diarios Oficiales</strong>
              <span>DOF · Nuevo León</span>
            </div>
          </div>

          <div className="topbar-status">
            <span className="sync-copy">
              <small>Última sincronización</small>
              <strong>{syncLabel(latestSync)}</strong>
            </span>
            <span className="operational-pill"><span /> Sistema operativo</span>
          </div>
        </header>

        <main className="dashboard-content">
          <section className="dashboard-heading">
            <div>
              <h1>Resumen operativo</h1>
              <p>Estado del monitor, publicaciones detectadas y elementos pendientes de revisión.</p>
            </div>
            <button className="secondary-action" type="button" onClick={resetFilters}>
              Limpiar filtros
            </button>
          </section>

          <section className="kpi-grid" aria-label="Estado general del monitor">
            {kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <article className="kpi-card" key={kpi.label}>
                  <div className={`kpi-icon ${kpi.tone}`}><Icon size={21} /></div>
                  <div className="kpi-copy">
                    <span>{kpi.label}</span>
                    <strong>{kpi.value}</strong>
                    <small>{kpi.detail}</small>
                  </div>
                </article>
              );
            })}
          </section>

          <section className="publications-card" id="publications">
            <div className="section-heading">
              <div>
                <h2>Publicaciones detectadas</h2>
                <p>{filtered.length} de {publications.length} publicaciones visibles</p>
              </div>
            </div>

            <div className="dashboard-filters" id="filters">
              <label className="dashboard-search">
                <Search size={18} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar documento, municipio, dependencia…"
                  aria-label="Buscar publicaciones"
                />
              </label>

              <label className="filter-control">
                <span>Fuente</span>
                <select value={source} onChange={(event) => setSource(event.target.value as SourceFilter)}>
                  <option value="all">Todas</option>
                  <option value="dof">DOF</option>
                  <option value="nuevo_leon">Nuevo León</option>
                </select>
              </label>

              <label className="filter-control">
                <span>Fecha</span>
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>

              <label className="filter-control">
                <span>Edición</span>
                <select value={edition} onChange={(event) => setEdition(event.target.value)}>
                  <option value="all">Todas</option>
                  {editions.map((item) => <option value={item} key={item}>{item}</option>)}
                </select>
              </label>

              <label className="filter-control">
                <span>Estado</span>
                <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
                  <option value="all">Todos</option>
                  <option value="PENDIENTE">Pendiente</option>
                  <option value="ENVIADO">Enviado</option>
                  <option value="COMPLETADO">Completado</option>
                </select>
              </label>
            </div>

            <div className="table-scroll">
              <table className="publications-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Fuente</th>
                    <th>Edición</th>
                    <th>Documento</th>
                    <th>Estado</th>
                    <th aria-label="Acciones">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((publication) => {
                    const firstDocument = publication.documents[0];
                    const mdLink = firstDocument?.mdDriveUrl;
                    const sourceLink = firstDocument?.sourceUrl;
                    const documentLabel = firstDocument?.name || "Documento oficial";

                    return (
                      <tr key={publication.id}>
                        <td className="date-cell">{dateLabel(publication.date)}</td>
                        <td><span className={`source-badge ${publication.source}`}>{publication.sourceLabel}</span></td>
                        <td className="edition-cell">{publication.edition || "—"}</td>
                        <td>
                          <div className="document-cell">
                            <FileText size={18} />
                            <span>
                              <strong>{documentLabel}</strong>
                              <small>{publication.documents.length} {publication.documents.length === 1 ? "archivo" : "archivos"}</small>
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`status-badge ${publication.status.toLowerCase()}`}>
                            <span aria-hidden="true" />
                            {statusLabel(publication.status)}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            {mdLink ? (
                              <a className="icon-button" href={mdLink} target="_blank" rel="noreferrer" title="Abrir Markdown en Drive" aria-label="Abrir Markdown en Drive">
                                <ExternalLink size={17} />
                              </a>
                            ) : sourceLink ? (
                              <a className="icon-button" href={sourceLink} target="_blank" rel="noreferrer" title="Abrir fuente oficial" aria-label="Abrir fuente oficial">
                                <ExternalLink size={17} />
                              </a>
                            ) : null}
                            <Link className="analysis-button" href={`/publicaciones/${publication.id}`}>
                              Ver análisis <ArrowUpRight size={16} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {!filtered.length ? (
                <div className="empty-state dashboard-empty">
                  <Search size={26} />
                  <h2>No hay publicaciones con esos filtros.</h2>
                  <p>Cambia la fuente, fecha, edición, estado o término de búsqueda.</p>
                </div>
              ) : null}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
