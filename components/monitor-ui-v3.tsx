"use client";

import { type FormEvent, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileSearch,
  FileText,
  Filter,
  Home,
  Landmark,
  Menu,
  MessageCircle,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
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

function chatUrl(publication: Publication) {
  const summary = clean(publication.analysis.summary);
  const links = publication.documents
    .map((doc) => doc.pdfDriveUrl || doc.mdDriveUrl || doc.sourceUrl)
    .filter(Boolean)
    .slice(0, 3)
    .join("\n");
  const prompt = [
    "Analiza esta publicación oficial en español claro.",
    `Fuente: ${sourceName(publication)}`,
    `Fecha: ${dateLabel(publication.date)}`,
    `Edición: ${publication.edition || "Sin edición"}`,
    summary ? `Resumen existente: ${summary}` : "No hay resumen existente.",
    links ? `Documentos:\n${links}` : "No hay enlaces de documentos.",
    "Identifica cambios, obligaciones, plazos, autoridades involucradas y posibles impactos.",
  ].join("\n\n");
  return `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
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
      return normalize([
        sourceName(publication), publication.date, publication.edition, publication.status,
        publication.analysis.summary, publication.analysis.changes, publication.analysis.agencies,
        publication.analysis.municipalities, ...publication.documents.map((doc) => doc.name),
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
          <span><i className="ok" />Monitor configurado</span>
          <strong>Revisión diaria</strong>
          <small>07:00 · America/Monterrey</small>
          <small>DOF y Nuevo León en paralelo</small>
        </div>
      </aside>

      {menuOpen ? <button className="md3-overlay" type="button" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} /> : null}

      <section className="md3-main">
        <header className="md3-topbar">
          <button className="md3-menu" type="button" aria-label="Abrir menú" onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? <X /> : <Menu />}</button>
          <label className="md3-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar publicación, dependencia, municipio…" /></label>
          <div className="md3-sync"><span><i />Datos cargados</span><small>{lastSync ? `Última actualización ${dateTimeLabel(lastSync)}` : "Sin sincronización registrada"}</small></div>
          <button className="md3-primary" type="button" onClick={() => openRun()}><Play size={15} fill="currentColor" />Revisar ahora</button>
        </header>

        {view === "dashboard" ? (
          <Dashboard
            publications={filtered}
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
            <span className="md3-modal-icon"><RefreshCw size={20} /></span>
            <h2>Ejecutar revisión</h2>
            <p>Elige exactamente qué fuente quieres revisar y cuántos días debe consultar el workflow.</p>
            <div className="md3-modal-grid">
              <label><span>Fuente</span><select value={runSource} onChange={(event) => setRunSource(event.target.value as RunSource)} disabled={runState === "running"}><option value="all">DOF + Nuevo León</option><option value="dof">Solo DOF</option><option value="nuevo-leon">Solo Nuevo León</option></select></label>
              <label><span>Días a revisar</span><select value={lookbackDays} onChange={(event) => setLookbackDays(Number(event.target.value))} disabled={runState === "running"}>{[1,2,3,4,5,6,7].map((day) => <option key={day} value={day}>{day} {day === 1 ? "día" : "días"}</option>)}</select></label>
            </div>
            <label className="md3-secret"><span>Código de autorización</span><input type="password" value={authorization} onChange={(event) => setAuthorization(event.target.value)} placeholder="Código privado" autoComplete="off" required disabled={runState === "running" || runState === "success"} /></label>
            {runState === "error" ? <div className="md3-result error"><CircleAlert size={18} /><span>{runMessage}</span></div> : null}
            {runState === "success" ? <div className="md3-result success"><CheckCircle2 size={18} /><span>{runMessage}</span>{runActionsUrl ? <a href={runActionsUrl} target="_blank" rel="noreferrer">Ver ejecución <ExternalLink size={13} /></a> : null}</div> : null}
            <div className="md3-modal-actions"><button type="button" onClick={() => setRunOpen(false)} disabled={runState === "running"}>Cerrar</button>{runState !== "success" ? <button className="md3-primary" type="submit" disabled={runState === "running" || !authorization}>{runState === "running" ? <><RefreshCw className="spin" size={15} />Iniciando…</> : <><Play size={15} fill="currentColor" />Ejecutar workflow</>}</button> : null}</div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Dashboard({ publications, totals, lastSync, onOpen, onPublications, onRun }: {
  publications: Publication[];
  totals: { publications: number; documents: number; pending: number; dof: number; nl: number };
  lastSync: string;
  onOpen: (publication: Publication) => void;
  onPublications: () => void;
  onRun: (options?: { source?: RunSource; days?: number }) => void;
}) {
  const latest = publications.slice(0, 6);
  return <main className="md3-page">
    <section className="md3-hero">
      <div><span className="md3-kicker"><Sparkles size={14} />Información oficial en un solo lugar</span><h1>Lo importante del DOF,<br /><em>sin perderte entre documentos.</em></h1><p>Monitorea publicaciones, revisa PDFs y ejecuta consultas manuales desde un panel que sí responde a tus acciones.</p></div>
      <div className="md3-hero-actions"><button className="md3-primary" type="button" onClick={() => onRun()}><Play size={16} fill="currentColor" />Ejecutar revisión</button><button className="md3-secondary" type="button" onClick={onPublications}>Explorar publicaciones <ArrowRight size={15} /></button></div>
    </section>

    <section className="md3-metrics">
      <Metric icon={<FileText />} value={totals.publications} label="Publicaciones" detail={`${totals.dof} DOF · ${totals.nl} Nuevo León`} tone="blue" />
      <Metric icon={<Download />} value={totals.documents} label="Documentos" detail="PDFs y archivos indexados" tone="cyan" />
      <Metric icon={<Clock3 />} value={totals.pending} label="Por revisar" detail="Pendientes o en proceso" tone="amber" />
      <Metric icon={<CheckCircle2 />} value={lastSync ? 1 : 0} label="Sincronización" detail={lastSync ? dateTimeLabel(lastSync) : "Sin registro"} tone="green" />
    </section>

    <section className="md3-dashboard-grid">
      <article className="md3-panel md3-recent">
        <div className="md3-panel-head"><div><span className="md3-icon blue"><FileText size={17} /></span><div><h2>Publicaciones recientes</h2><p>Abre directamente el documento que necesites.</p></div></div><button type="button" onClick={onPublications}>Ver todas <ArrowRight size={14} /></button></div>
        <div className="md3-recent-list">
          {latest.map((item) => <button key={item.id} type="button" onClick={() => onOpen(item)}><SourceBadge publication={item} /><span className="md3-recent-copy"><strong>{sourceName(item)} · {item.edition || "Sin edición"}</strong><small>{dateLabel(item.date, true)} · {item.documents.length} archivo(s)</small></span><StatusBadge status={item.status} /><ChevronRight size={17} /></button>)}
          {!latest.length ? <div className="md3-empty">No hay publicaciones que coincidan con la búsqueda.</div> : null}
        </div>
      </article>

      <aside className="md3-side-stack">
        <article className="md3-panel md3-schedule">
          <div className="md3-panel-head"><div><span className="md3-icon violet"><CalendarDays size={17} /></span><div><h2>Automatización real</h2><p>Configuración del workflow.</p></div></div></div>
          <div className="md3-schedule-time"><strong>07:00</strong><span><b>Revisión diaria</b><small>America/Monterrey</small></span><i>Activa</i></div>
          <div className="md3-source-runs"><button type="button" onClick={() => onRun({ source: "dof", days: 2 })}><Landmark size={16} /><span><b>DOF</b><small>Ejecutar solo esta fuente</small></span><Play size={15} /></button><button type="button" onClick={() => onRun({ source: "nuevo-leon", days: 2 })}><Building2 size={16} /><span><b>Nuevo León</b><small>Ejecutar solo esta fuente</small></span><Play size={15} /></button></div>
        </article>
        <article className="md3-panel md3-tip"><span className="md3-icon orange"><Filter size={17} /></span><div><h2>Menos botones, más función</h2><p>Las acciones principales ahora filtran, abren documentos, descargan archivos o ejecutan el monitor con parámetros reales.</p></div></article>
      </aside>
    </section>
  </main>;
}

function Metric({ icon, value, label, detail, tone }: { icon: React.ReactNode; value: number; label: string; detail: string; tone: string }) {
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
    <section className="md3-page-title"><div><span>Biblioteca oficial</span><h1>Publicaciones</h1><p>{publications.length} de {total} registros visibles con los filtros actuales.</p></div><button className="md3-secondary" type="button" onClick={onExport}><Download size={15} />Exportar CSV</button></section>
    <section className="md3-filters">
      <label className="md3-filter-search"><Search size={15} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Buscar por texto, dependencia, municipio…" /></label>
      <label><span>Fuente</span><select value={source} onChange={(event) => onSource(event.target.value as SourceFilter)}><option value="all">Todas</option><option value="dof">DOF</option><option value="nuevo_leon">Nuevo León</option></select></label>
      <label><span>Estado</span><select value={status} onChange={(event) => onStatus(event.target.value as StatusFilter)}><option value="all">Todos</option><option value="PENDIENTE">Pendiente</option><option value="ENVIADO">Enviado</option><option value="COMPLETADO">Completado</option></select></label>
      <button type="button" onClick={onReset}><X size={14} />Limpiar</button>
    </section>

    <section className="md3-panel md3-table-panel">
      <div className="md3-table-wrap"><table><thead><tr><th>Fuente</th><th>Fecha</th><th>Edición</th><th>Archivos</th><th>Estado</th><th>Actualizado</th><th /></tr></thead><tbody>
        {publications.map((item) => <tr key={item.id}><td><SourceBadge publication={item} /><b>{sourceName(item)}</b></td><td>{dateLabel(item.date, true)}</td><td>{item.edition || "Sin edición"}</td><td>{item.documents.length}</td><td><StatusBadge status={item.status} /></td><td>{dateTimeLabel(item.updatedAt)}</td><td><button className="md3-row-action" type="button" onClick={() => onOpen(item)}>Abrir <ChevronRight size={14} /></button></td></tr>)}
        {!publications.length ? <tr><td colSpan={7}><div className="md3-empty">No encontramos publicaciones con esos filtros.</div></td></tr> : null}
      </tbody></table></div>
      <div className="md3-mobile-cards">{publications.map((item) => <button key={item.id} type="button" onClick={() => onOpen(item)}><div><SourceBadge publication={item} /><StatusBadge status={item.status} /></div><strong>{sourceName(item)} · {item.edition || "Sin edición"}</strong><small>{dateLabel(item.date)} · {item.documents.length} archivo(s)</small><span>Abrir detalle <ArrowRight size={14} /></span></button>)}</div>
    </section>
  </main>;
}

function Detail({ publication, copied, onCopy, onBack, onRun }: { publication: Publication; copied: string; onCopy: (value: string, key: string) => void; onBack: () => void; onRun: () => void }) {
  const firstDoc = publication.documents[0];
  const previewUrl = documentUrl(firstDoc, "pdf");
  const pdfDownload = documentUrl(firstDoc, "pdf", true);
  const markdown = documentUrl(firstDoc, "markdown");
  const summary = clean(publication.analysis.summary) || "El análisis todavía no contiene un resumen ejecutivo.";
  const agencies = clean(publication.analysis.agencies);
  const municipalities = clean(publication.analysis.municipalities);
  const changes = clean(publication.analysis.changes);

  return <main className="md3-page md3-detail-page">
    <button className="md3-back" type="button" onClick={onBack}><ArrowLeft size={15} />Volver a publicaciones</button>
    <section className="md3-detail-title"><div><SourceBadge publication={publication} /><StatusBadge status={publication.status} /></div><h1>{sourceName(publication)}</h1><p>{publication.edition || "Sin edición"} · {dateLabel(publication.date)}</p></section>

    <section className="md3-detail-grid">
      <div className="md3-detail-main">
        <article className="md3-panel md3-pdf-panel">
          <div className="md3-panel-head"><div><span className="md3-icon blue"><FileText size={17} /></span><div><h2>Documento</h2><p>{firstDoc?.name || "Sin archivo disponible"}</p></div></div>{pdfDownload ? <a className="md3-secondary" href={pdfDownload} target="_blank" rel="noreferrer"><Download size={14} />Descargar</a> : null}</div>
          {previewUrl ? <iframe className="md3-pdf-frame" src={previewUrl} title={`PDF ${sourceName(publication)}`} /> : <div className="md3-pdf-empty"><FileText size={34} /><b>Vista previa no disponible</b><span>El documento todavía no tiene un enlace PDF utilizable.</span></div>}
        </article>
      </div>

      <aside className="md3-detail-side">
        <article className="md3-panel md3-summary"><div className="md3-panel-head"><div><span className="md3-icon violet"><Sparkles size={17} /></span><div><h2>Resumen ejecutivo</h2><p>Análisis registrado</p></div></div></div><p>{summary}</p>{changes ? <div className="md3-highlight"><b>Cambios detectados</b><span>{changes}</span></div> : null}</article>

        <article className="md3-panel md3-meta"><h2>Información</h2><dl><div><dt>Fuente</dt><dd>{sourceName(publication)}</dd></div><div><dt>Fecha</dt><dd>{dateLabel(publication.date)}</dd></div><div><dt>Edición</dt><dd>{publication.edition || "Sin edición"}</dd></div><div><dt>Archivos</dt><dd>{publication.documents.length}</dd></div><div><dt>Dependencias</dt><dd>{agencies || "No detectadas"}</dd></div><div><dt>Municipios</dt><dd>{municipalities || "No detectados"}</dd></div>{firstDoc?.sha256 ? <div><dt>SHA-256</dt><dd><code>{firstDoc.sha256.slice(0, 18)}…</code><button type="button" onClick={() => onCopy(firstDoc.sha256, firstDoc.id)}>{copied === firstDoc.id ? <Check size={14} /> : <Copy size={14} />}</button></dd></div> : null}</dl></article>

        <article className="md3-panel md3-actions-panel"><h2>Acciones útiles</h2><a className="md3-chat" href={chatUrl(publication)} target="_blank" rel="noreferrer"><MessageCircle size={15} />Analizar con ChatGPT <ExternalLink size={13} /></a>{pdfDownload ? <a href={pdfDownload} target="_blank" rel="noreferrer"><Download size={15} />Descargar PDF</a> : null}{markdown ? <a href={markdown} target="_blank" rel="noreferrer"><FileText size={15} />Abrir Markdown</a> : null}{firstDoc?.sourceUrl ? <a href={firstDoc.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />Abrir fuente oficial</a> : null}<button type="button" onClick={onRun}><RefreshCw size={15} />Volver a revisar esta fuente</button></article>
      </aside>
    </section>
  </main>;
}
