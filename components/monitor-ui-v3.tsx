"use client";

import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileSearch,
  FileText,
  Home,
  Landmark,
  Menu,
  MessageCircle,
  Play,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { buildPublicationChatUrl } from "@/lib/chatgpt";
import type { Publication } from "@/lib/types";

export type MonitorView = "dashboard" | "publications" | "detail";
type SourceFilter = "all" | "dof" | "nuevo_leon";
type StatusFilter = "all" | "COMPLETADO" | "ENVIADO" | "PENDIENTE";
type RunSource = "all" | "dof" | "nuevo-leon";
type RunState = "idle" | "running" | "success" | "error";

type MonitorUiProps = {
  publications: Publication[];
  initialView?: MonitorView;
  selectedId?: string;
};

function clean(value = "") {
  return value
    .replace(/https?:\/\/[^\s]+/gi, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalize(value = "") {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function dateLabel(value: string, short = false) {
  if (!value) return "Sin fecha";
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: short ? "short" : "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function dateTimeLabel(value: string) {
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

function sourceName(publication: Publication) {
  return publication.sourceLabel || (publication.source === "nuevo_leon" ? "Nuevo León" : "DOF");
}

function sourceRunValue(publication: Publication): RunSource {
  return publication.source === "nuevo_leon" ? "nuevo-leon" : "dof";
}

function statusLabel(status: string) {
  if (status === "COMPLETADO") return "Completado";
  if (status === "ENVIADO") return "Enviado";
  if (status === "PENDIENTE") return "Pendiente";
  return status || "Sin estado";
}

function statusClass(status: string) {
  if (status === "COMPLETADO") return "success";
  if (status === "ENVIADO") return "info";
  if (status === "PENDIENTE") return "warning";
  return "neutral";
}

function latestSync(publications: Publication[]) {
  return publications.reduce((latest, item) => {
    if (!item.updatedAt) return latest;
    if (!latest) return item.updatedAt;
    return Date.parse(item.updatedAt) > Date.parse(latest) ? item.updatedAt : latest;
  }, "");
}

function documentUrl(document: Publication["documents"][number] | undefined, kind: "pdf" | "markdown", download = false) {
  if (!document) return "";
  const id = kind === "pdf" ? document.pdfFileId : document.mdFileId;
  const fallback = kind === "pdf" ? document.pdfDriveUrl || document.sourceUrl : document.mdDriveUrl;
  if (!id) return fallback;
  return `/api/documents/${encodeURIComponent(id)}${download ? "?download=1" : ""}`;
}

function documentTitle(document: Publication["documents"][number], index: number) {
  const part = document.part?.trim();
  if (part) return `Parte ${part}`;
  const name = document.name?.trim();
  return name || `Archivo ${index + 1}`;
}

function hasAnalysis(publication: Publication | undefined) {
  if (!publication) return false;
  const analysis = publication.analysis;
  return Boolean(
    clean(analysis.summary) ||
    clean(analysis.changes) ||
    clean(analysis.mobility) ||
    clean(analysis.construction) ||
    clean(analysis.urbanism) ||
    clean(analysis.infrastructure) ||
    clean(analysis.housing) ||
    clean(analysis.landUse) ||
    clean(analysis.permits),
  );
}

function usefulTopicValue(value = "") {
  const text = clean(value);
  const normalized = normalize(text).replace(/[.]/g, "").trim();
  if (!text || normalized === "no" || normalized === "n/a" || normalized === "ninguno" || normalized === "ninguna") return null;
  return normalized === "si" ? "" : text;
}

function splitList(value = "") {
  const text = clean(value);
  if (!text) return [];
  const separator = text.includes("\n") ? /\n+/ : /\s*;\s*|\s*,\s*/;
  return text
    .split(separator)
    .map((item) => item.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);
}

function topicEntries(publication: Publication) {
  const a = publication.analysis;
  const topics = [
    ["Movilidad", a.mobility],
    ["Construcción", a.construction],
    ["Urbanismo", a.urbanism],
    ["Infraestructura", a.infrastructure],
    ["Vivienda", a.housing],
    ["Uso de suelo", a.landUse],
    ["Permisos y licencias", a.permits],
  ] as const;

  return topics.flatMap(([label, value]) => {
    const detail = usefulTopicValue(value);
    return detail === null ? [] : [{ label, detail }];
  });
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`md3-status ${statusClass(status)}`}>{status === "COMPLETADO" ? <Check size={12} /> : <Clock3 size={12} />}{statusLabel(status)}</span>;
}

function SourceBadge({ publication }: { publication: Publication }) {
  const nl = publication.source === "nuevo_leon";
  return <span className={`md3-source ${nl ? "nl" : "dof"}`}>{nl ? <Building2 size={13} /> : <Landmark size={13} />}{nl ? "NL" : "DOF"}</span>;
}

export function MonitorUiV3({ publications, initialView = "dashboard", selectedId }: MonitorUiProps) {
  const [view, setView] = useState<MonitorView>(initialView);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selectedIdState, setSelectedIdState] = useState(selectedId || publications[0]?.id || "");
  const [menuOpen, setMenuOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [runSource, setRunSource] = useState<RunSource>("all");
  const [lookbackDays, setLookbackDays] = useState(2);
  const [authorization, setAuthorization] = useState("");
  const [runState, setRunState] = useState<RunState>("idle");
  const [runMessage, setRunMessage] = useState("");
  const [runActionsUrl, setRunActionsUrl] = useState("");
  const [copied, setCopied] = useState("");

  const filtered = useMemo(() => {
    const term = normalize(query.trim());
    return publications.filter((publication) => {
      if (source !== "all" && publication.source !== source) return false;
      if (status !== "all" && publication.status !== status) return false;
      if (!term) return true;
      const a = publication.analysis;
      return normalize([
        sourceName(publication), publication.date, publication.edition, publication.status,
        a.summary, a.changes, a.agencies, a.municipalities, a.mobility, a.construction,
        a.urbanism, a.infrastructure, a.housing, a.landUse, a.permits, a.historicalComparison,
        ...publication.documents.map((doc) => doc.name),
      ].join(" ")).includes(term);
    });
  }, [publications, query, source, status]);

  const selected = publications.find((item) => item.id === selectedIdState) || filtered[0] || publications[0];
  const dofCount = publications.filter((item) => item.source === "dof").length;
  const nlCount = publications.filter((item) => item.source === "nuevo_leon").length;
  const pendingCount = publications.filter((item) => item.status !== "COMPLETADO").length;
  const documentCount = publications.reduce((sum, item) => sum + item.documents.length, 0);
  const lastSync = latestSync(publications);

  function navigate(next: MonitorView) {
    setView(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openDetail(publication: Publication) {
    setSelectedIdState(publication.id);
    navigate("detail");
  }

  function openRun(options?: { source?: RunSource; days?: number }) {
    setRunSource(options?.source || "all");
    setLookbackDays(options?.days || 2);
    setRunState("idle");
    setRunMessage("");
    setRunActionsUrl("");
    setRunOpen(true);
  }

  function resetFilters() {
    setQuery("");
    setSource("all");
    setStatus("all");
  }

  function exportCsv() {
    const headers = ["Fuente", "Fecha", "Edición", "Estado", "Archivos", "Documento ID"];
    const esc = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const rows = filtered.map((item) => [sourceName(item), item.date, item.edition, statusLabel(item.status), item.documents.length, item.id]);
    const csv = [headers, ...rows].map((row) => row.map(esc).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "publicaciones-monitor.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyText(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      setCopied("");
    }
  }

  async function runMonitor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRunState("running");
    setRunMessage("");
    setRunActionsUrl("");
    try {
      const response = await fetch("/api/actions/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorization, source: runSource, lookback_days: lookbackDays }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string; error?: string; actions_url?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo iniciar el workflow.");
      setRunMessage(payload.message || "Workflow iniciado correctamente.");
      setRunActionsUrl(payload.actions_url || "");
      setAuthorization("");
      setRunState("success");
    } catch (error) {
      setRunMessage(error instanceof Error ? error.message : "No se pudo iniciar el workflow.");
      setRunState("error");
    }
  }

  return (
    <div className="md3-app">
      <aside className={`md3-sidebar ${menuOpen ? "open" : ""}`}>
        <button className="md3-brand" type="button" onClick={() => navigate("dashboard")}>
          <span className="md3-brand-mark"><FileSearch size={23} /></span>
          <span><strong>Monitor Oficial</strong><small>DOF + Nuevo León</small></span>
        </button>
        <nav className="md3-nav">
          <button className={view === "dashboard" ? "active" : ""} type="button" onClick={() => navigate("dashboard")}><Home size={18} />Inicio</button>
          <button className={view === "publications" || view === "detail" ? "active" : ""} type="button" onClick={() => navigate("publications")}><FileText size={18} />Publicaciones</button>
          <button type="button" onClick={() => openRun()}><Play size={18} />Ejecutar revisión</button>
        </nav>
        <div className="md3-sidebar-info">
          <span><i />Activo</span>
          <strong>Revisión diaria · 07:00</strong>
          <small>America/Monterrey</small>
        </div>
      </aside>

      {menuOpen ? <button className="md3-overlay" type="button" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} /> : null}

      <section className="md3-main">
        <header className="md3-topbar">
          <button className="md3-menu" type="button" aria-label="Abrir menú" onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? <X /> : <Menu />}</button>
          <label className="md3-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar publicaciones" /></label>
          <div className="md3-sync"><span><i />Actualizado</span><small>{lastSync ? dateTimeLabel(lastSync) : "Sin registro"}</small></div>
          <button className="md3-primary" type="button" onClick={() => openRun()}><Play size={15} fill="currentColor" />Ejecutar</button>
        </header>

        {view === "dashboard" ? (
          <Dashboard
            publications={filtered}
            allPublications={publications}
            totals={{ publications: publications.length, documents: documentCount, pending: pendingCount, dof: dofCount, nl: nlCount }}
            lastSync={lastSync}
            onOpen={openDetail}
            onPublications={() => navigate("publications")}
            onRun={openRun}
          />
        ) : null}

        {view === "publications" ? (
          <Publications
            publications={filtered}
            total={publications.length}
            source={source}
            status={status}
            query={query}
            onQuery={setQuery}
            onSource={setSource}
            onStatus={setStatus}
            onReset={resetFilters}
            onExport={exportCsv}
            onOpen={openDetail}
          />
        ) : null}

        {view === "detail" && selected ? (
          <Detail
            key={selected.id}
            publication={selected}
            copied={copied}
            onCopy={copyText}
            onBack={() => navigate("publications")}
            onRun={() => openRun({ source: sourceRunValue(selected), days: 2 })}
          />
        ) : null}
      </section>

      {runOpen ? (
        <div className="md3-modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && setRunOpen(false)}>
          <form className="md3-modal" onSubmit={runMonitor}>
            <button className="md3-modal-close" type="button" aria-label="Cerrar" onClick={() => setRunOpen(false)} disabled={runState === "running"}><X size={18} /></button>
            <h2>Ejecutar revisión</h2>
            <p>Selecciona fuente y periodo.</p>
            <div className="md3-modal-grid">
              <label><span>Fuente</span><select value={runSource} onChange={(event) => setRunSource(event.target.value as RunSource)} disabled={runState === "running"}><option value="all">DOF + Nuevo León</option><option value="dof">DOF</option><option value="nuevo-leon">Nuevo León</option></select></label>
              <label><span>Días</span><select value={lookbackDays} onChange={(event) => setLookbackDays(Number(event.target.value))} disabled={runState === "running"}>{[1,2,3,4,5,6,7].map((day) => <option key={day} value={day}>{day}</option>)}</select></label>
            </div>
            <label className="md3-secret"><span>Código de autorización</span><input type="password" value={authorization} onChange={(event) => setAuthorization(event.target.value)} placeholder="Código privado" autoComplete="off" required disabled={runState === "running" || runState === "success"} /></label>
            {runState === "error" ? <div className="md3-result error"><CircleAlert size={18} /><span>{runMessage}</span></div> : null}
            {runState === "success" ? <div className="md3-result success"><CheckCircle2 size={18} /><span>{runMessage}</span>{runActionsUrl ? <a href={runActionsUrl} target="_blank" rel="noreferrer">GitHub Actions <ExternalLink size={13} /></a> : null}</div> : null}
            <div className="md3-modal-actions"><button type="button" onClick={() => setRunOpen(false)} disabled={runState === "running"}>Cerrar</button>{runState !== "success" ? <button className="md3-primary" type="submit" disabled={runState === "running" || !authorization}>{runState === "running" ? <><RefreshCw className="spin" size={15} />Iniciando…</> : <><Play size={15} fill="currentColor" />Ejecutar</>}</button> : null}</div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Dashboard({ publications, allPublications, totals, lastSync, onOpen, onPublications, onRun }: {
  publications: Publication[];
  allPublications: Publication[];
  totals: { publications: number; documents: number; pending: number; dof: number; nl: number };
  lastSync: string;
  onOpen: (publication: Publication) => void;
  onPublications: () => void;
  onRun: (options?: { source?: RunSource; days?: number }) => void;
}) {
  const latest = publications.slice(0, 5);
  const newest = allPublications[0];
  const latestAnalyzed = allPublications.find((item) => hasAnalysis(item));
  const report = hasAnalysis(newest) ? newest : latestAnalyzed;

  return <main className="md3-page">
    <section className="md3-dashboard-head">
      <div><h1>Monitor de diarios oficiales</h1><p>Última publicación y análisis consolidado.</p></div>
      <div className="md3-head-actions"><button className="md3-secondary" type="button" onClick={onPublications}>Publicaciones <ArrowRight size={15} /></button><button className="md3-primary" type="button" onClick={() => onRun()}><Play size={15} fill="currentColor" />Ejecutar</button></div>
    </section>

    <LatestReport newest={newest} report={report} onOpen={onOpen} />

    <section className="md3-metrics md3-metrics-compact">
      <Metric icon={<FileText />} value={totals.publications} label="Publicaciones" detail={`${totals.dof} DOF · ${totals.nl} Nuevo León`} tone="blue" />
      <Metric icon={<Download />} value={totals.documents} label="Archivos" detail="Documentos registrados" tone="cyan" />
      <Metric icon={<Clock3 />} value={totals.pending} label="En proceso" detail="Pendientes o enviados" tone="amber" />
      <Metric icon={<CheckCircle2 />} value={lastSync ? 1 : 0} label="Última carga" detail={lastSync ? dateTimeLabel(lastSync) : "Sin registro"} tone="green" />
    </section>

    <section className="md3-dashboard-grid md3-dashboard-grid-lower">
      <article className="md3-panel md3-recent">
        <div className="md3-panel-head"><div><h2>Publicaciones recientes</h2></div><button type="button" onClick={onPublications}>Ver todas <ArrowRight size={14} /></button></div>
        <div className="md3-recent-list">
          {latest.map((item) => <button key={item.id} type="button" onClick={() => onOpen(item)}><SourceBadge publication={item} /><span className="md3-recent-copy"><strong>{item.edition || sourceName(item)}</strong><small>{dateLabel(item.date, true)} · {item.documents.length} archivo(s)</small></span><StatusBadge status={item.status} /><ChevronRight size={17} /></button>)}
          {!latest.length ? <div className="md3-empty">Sin resultados.</div> : null}
        </div>
      </article>

      <aside className="md3-side-stack">
        <article className="md3-panel md3-schedule">
          <div className="md3-panel-head"><div><h2>Programación</h2></div></div>
          <div className="md3-schedule-time"><strong>07:00</strong><span><b>Diaria</b><small>America/Monterrey</small></span><i>Activa</i></div>
          <div className="md3-source-runs"><button type="button" onClick={() => onRun({ source: "dof", days: 2 })}><Landmark size={16} /><span><b>DOF</b><small>Ejecutar</small></span><Play size={15} /></button><button type="button" onClick={() => onRun({ source: "nuevo-leon", days: 2 })}><Building2 size={16} /><span><b>Nuevo León</b><small>Ejecutar</small></span><Play size={15} /></button></div>
        </article>
      </aside>
    </section>
  </main>;
}

function LatestReport({ newest, report, onOpen }: { newest?: Publication; report?: Publication; onOpen: (publication: Publication) => void }) {
  if (!newest) return <section className="md3-panel md3-latest-report"><div className="md3-empty">No hay publicaciones registradas.</div></section>;

  const reportIsCurrent = report?.id === newest.id;
  const topics = report ? topicEntries(report) : [];
  const municipalities = report ? splitList(report.analysis.municipalities) : [];
  const agencies = report ? splitList(report.analysis.agencies) : [];
  const summary = report ? clean(report.analysis.summary) : "";
  const changes = report ? clean(report.analysis.changes) : "";
  const history = report ? clean(report.analysis.historicalComparison) : "";
  const modifies = report ? clean(report.analysis.modifiesPrevious) : "";

  return <section className="md3-latest-stack">
    {!reportIsCurrent ? <article className="md3-current-item">
      <div><span>Última publicación detectada</span><strong>{newest.edition || sourceName(newest)}</strong><small>{sourceName(newest)} · {dateLabel(newest.date)} · {newest.documents.length} archivo(s)</small></div>
      <div><StatusBadge status={newest.status} /><button type="button" onClick={() => onOpen(newest)}>Abrir <ChevronRight size={14} /></button></div>
    </article> : null}

    {report ? <article className="md3-panel md3-latest-report">
      <header className="md3-report-header">
        <div className="md3-report-id"><SourceBadge publication={report} /><div><span>{reportIsCurrent ? "Última publicación" : "Último análisis disponible"}</span><h2>{report.edition || sourceName(report)}</h2><p>{sourceName(report)} · {dateLabel(report.date)} · {report.documents.length} archivo(s)</p></div></div>
        <div className="md3-report-actions"><StatusBadge status={report.status} /><button className="md3-secondary" type="button" onClick={() => onOpen(report)}>Abrir detalle</button><a className="md3-primary" href={buildPublicationChatUrl(report)} target="_blank" rel="noreferrer"><MessageCircle size={15} />ChatGPT</a></div>
      </header>

      <div className="md3-report-layout">
        <section className="md3-report-main">
          <div className="md3-report-section">
            <h3>Resumen</h3>
            {summary ? <div className="md3-analysis-copy">{summary}</div> : <p className="md3-muted-copy">Análisis pendiente.</p>}
          </div>

          {changes ? <div className="md3-report-section"><h3>Cambios</h3><div className="md3-analysis-copy">{changes}</div></div> : null}

          {topics.length ? <div className="md3-report-section"><h3>Temas</h3><div className="md3-topic-list">{topics.map((topic) => <div key={topic.label}><b>{topic.label}</b>{topic.detail ? <span>{topic.detail}</span> : null}</div>)}</div></div> : null}

          {(modifies || history) ? <details className="md3-history"><summary>Antecedentes</summary>{modifies ? <div><b>Modifica publicaciones anteriores</b><p>{modifies}</p></div> : null}{history ? <div><b>Comparación histórica</b><p>{history}</p></div> : null}</details> : null}
        </section>

        <aside className="md3-report-side">
          {municipalities.length ? <section><h3>Municipios</h3><ul>{municipalities.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section> : null}
          {agencies.length ? <section><h3>Dependencias</h3><ul>{agencies.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section> : null}
          <section><h3>Documentos</h3><div className="md3-report-docs">{report.documents.map((document, index) => {
            const md = documentUrl(document, "markdown");
            const pdf = documentUrl(document, "pdf");
            return <div key={document.id || `${report.id}-${index}`}><span><b>{documentTitle(document, index)}</b><small>{document.name}</small></span>{md ? <a href={md} target="_blank" rel="noreferrer">MD <ExternalLink size={12} /></a> : pdf ? <a href={pdf} target="_blank" rel="noreferrer">PDF <ExternalLink size={12} /></a> : null}</div>;
          })}</div></section>
        </aside>
      </div>
    </article> : <article className="md3-panel md3-latest-report"><div className="md3-empty">Todavía no hay un análisis disponible.</div></article>}
  </section>;
}

function Metric({ icon, value, label, detail, tone }: { icon: ReactNode; value: number; label: string; detail: string; tone: string }) {
  return <article className={`md3-metric ${tone}`}><span>{icon}</span><div><strong>{value}</strong><b>{label}</b><small>{detail}</small></div></article>;
}

function Publications({ publications, total, source, status, query, onQuery, onSource, onStatus, onReset, onExport, onOpen }: {
  publications: Publication[];
  total: number;
  source: SourceFilter;
  status: StatusFilter;
  query: string;
  onQuery: (value: string) => void;
  onSource: (value: SourceFilter) => void;
  onStatus: (value: StatusFilter) => void;
  onReset: () => void;
  onExport: () => void;
  onOpen: (publication: Publication) => void;
}) {
  return <main className="md3-page">
    <section className="md3-page-title"><div><h1>Publicaciones</h1><p>{publications.length} de {total}</p></div><button className="md3-secondary" type="button" onClick={onExport}><Download size={15} />CSV</button></section>
    <section className="md3-filters">
      <label className="md3-filter-search"><Search size={15} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Buscar" /></label>
      <label><span>Fuente</span><select value={source} onChange={(event) => onSource(event.target.value as SourceFilter)}><option value="all">Todas</option><option value="dof">DOF</option><option value="nuevo_leon">Nuevo León</option></select></label>
      <label><span>Estado</span><select value={status} onChange={(event) => onStatus(event.target.value as StatusFilter)}><option value="all">Todos</option><option value="PENDIENTE">Pendiente</option><option value="ENVIADO">Enviado</option><option value="COMPLETADO">Completado</option></select></label>
      <button type="button" onClick={onReset}><X size={14} />Limpiar</button>
    </section>

    <section className="md3-panel md3-table-panel">
      <div className="md3-table-wrap"><table><thead><tr><th>Fuente</th><th>Fecha</th><th>Edición</th><th>Archivos</th><th>Estado</th><th>Actualizado</th><th /></tr></thead><tbody>
        {publications.map((item) => <tr key={item.id}><td><SourceBadge publication={item} /><b>{sourceName(item)}</b></td><td>{dateLabel(item.date, true)}</td><td>{item.edition || "Sin edición"}</td><td>{item.documents.length}</td><td><StatusBadge status={item.status} /></td><td>{dateTimeLabel(item.updatedAt)}</td><td><button className="md3-row-action" type="button" onClick={() => onOpen(item)}>Abrir <ChevronRight size={14} /></button></td></tr>)}
        {!publications.length ? <tr><td colSpan={7}><div className="md3-empty">Sin resultados.</div></td></tr> : null}
      </tbody></table></div>
      <div className="md3-mobile-cards">{publications.map((item) => <button key={item.id} type="button" onClick={() => onOpen(item)}><div><SourceBadge publication={item} /><StatusBadge status={item.status} /></div><strong>{item.edition || sourceName(item)}</strong><small>{dateLabel(item.date)} · {item.documents.length} archivo(s)</small><span>Abrir <ArrowRight size={14} /></span></button>)}</div>
    </section>
  </main>;
}

function Detail({ publication, copied, onCopy, onBack, onRun }: { publication: Publication; copied: string; onCopy: (value: string, key: string) => void; onBack: () => void; onRun: () => void }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const documents = publication.documents;
  const safeIndex = Math.min(activeIndex, Math.max(documents.length - 1, 0));
  const activeDocument = documents[safeIndex];
  const previewUrl = documentUrl(activeDocument, "pdf");
  const pdfDownload = documentUrl(activeDocument, "pdf", true);
  const markdown = documentUrl(activeDocument, "markdown");
  const summary = clean(publication.analysis.summary) || "Sin resumen.";
  const agencies = clean(publication.analysis.agencies);
  const municipalities = clean(publication.analysis.municipalities);
  const changes = clean(publication.analysis.changes);
  const topics = topicEntries(publication);

  return <main className="md3-page md3-detail-page">
    <button className="md3-back" type="button" onClick={onBack}><ArrowLeft size={15} />Publicaciones</button>
    <section className="md3-detail-title"><div><SourceBadge publication={publication} /><StatusBadge status={publication.status} /></div><h1>{publication.edition || sourceName(publication)}</h1><p>{sourceName(publication)} · {dateLabel(publication.date)}</p></section>

    <section className="md3-detail-grid">
      <div className="md3-detail-main">
        <article className="md3-panel md3-pdf-panel">
          <div className="md3-document-head">
            <div><h2>Documentos</h2><p>{documents.length} archivo(s)</p></div>
            {documents.length > 1 ? <div className="md3-doc-nav"><button type="button" aria-label="Archivo anterior" disabled={safeIndex === 0} onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}><ChevronLeft size={17} /></button><b>{safeIndex + 1} / {documents.length}</b><button type="button" aria-label="Archivo siguiente" disabled={safeIndex >= documents.length - 1} onClick={() => setActiveIndex((index) => Math.min(documents.length - 1, index + 1))}><ChevronRight size={17} /></button></div> : null}
          </div>

          {documents.length > 1 && documents.length <= 6 ? <div className="md3-doc-switcher" role="tablist" aria-label="Documentos de la publicación">{documents.map((document, index) => <button key={document.id || `${publication.id}-${index}`} type="button" role="tab" aria-selected={safeIndex === index} className={safeIndex === index ? "active" : ""} onClick={() => setActiveIndex(index)}><span>Archivo {index + 1}</span><small>{documentTitle(document, index)}</small></button>)}</div> : null}

          {documents.length > 6 ? <label className="md3-doc-select"><span>Archivo</span><select value={safeIndex} onChange={(event) => setActiveIndex(Number(event.target.value))}>{documents.map((document, index) => <option key={document.id || `${publication.id}-${index}`} value={index}>{index + 1}. {documentTitle(document, index)}</option>)}</select></label> : null}

          <div className="md3-active-document">
            <div><b>{activeDocument ? documentTitle(activeDocument, safeIndex) : "Sin archivo"}</b><small>{activeDocument?.name || ""}</small></div>
            <div>{markdown ? <a className="md3-secondary" href={markdown} target="_blank" rel="noreferrer"><FileText size={14} />MD</a> : null}{pdfDownload ? <a className="md3-secondary" href={pdfDownload} target="_blank" rel="noreferrer"><Download size={14} />PDF</a> : null}</div>
          </div>

          {previewUrl ? <iframe key={previewUrl} className="md3-pdf-frame" src={previewUrl} title={`PDF ${safeIndex + 1} de ${sourceName(publication)}`} /> : <div className="md3-pdf-empty"><FileText size={34} /><b>Vista previa no disponible</b></div>}
        </article>
      </div>

      <aside className="md3-detail-side">
        <article className="md3-panel md3-summary"><div className="md3-panel-head"><div><h2>Resumen</h2></div></div><div className="md3-analysis-copy">{summary}</div>{changes ? <div className="md3-highlight"><b>Cambios</b><span>{changes}</span></div> : null}{topics.length ? <div className="md3-detail-topics"><b>Temas</b>{topics.map((topic) => <span key={topic.label}>{topic.label}{topic.detail ? ` · ${topic.detail}` : ""}</span>)}</div> : null}</article>

        <article className="md3-panel md3-meta"><h2>Información</h2><dl><div><dt>Fuente</dt><dd>{sourceName(publication)}</dd></div><div><dt>Fecha</dt><dd>{dateLabel(publication.date)}</dd></div><div><dt>Edición</dt><dd>{publication.edition || "Sin edición"}</dd></div><div><dt>Archivos</dt><dd>{documents.length}</dd></div><div><dt>Dependencias</dt><dd>{agencies || "No detectadas"}</dd></div><div><dt>Municipios</dt><dd>{municipalities || "No detectados"}</dd></div>{activeDocument?.sha256 ? <div><dt>SHA-256</dt><dd><code>{activeDocument.sha256.slice(0, 18)}…</code><button type="button" aria-label="Copiar SHA-256" onClick={() => onCopy(activeDocument.sha256, activeDocument.id)}>{copied === activeDocument.id ? <Check size={14} /> : <Copy size={14} />}</button></dd></div> : null}</dl></article>

        <article className="md3-panel md3-actions-panel"><h2>Acciones</h2>{markdown ? <a href={markdown} target="_blank" rel="noreferrer"><FileText size={15} />Abrir Markdown actual</a> : null}{pdfDownload ? <a href={pdfDownload} target="_blank" rel="noreferrer"><Download size={15} />Descargar PDF actual</a> : null}{activeDocument?.sourceUrl ? <a href={activeDocument.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />Fuente oficial</a> : null}<a href={buildPublicationChatUrl(publication)} target="_blank" rel="noreferrer"><MessageCircle size={15} />ChatGPT · todos los MD</a><button type="button" onClick={onRun}><RefreshCw size={15} />Revisar fuente</button></article>
      </aside>
    </section>
  </main>;
}
