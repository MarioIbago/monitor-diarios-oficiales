"use client";

import { type FormEvent, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock3,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileText,
  Home,
  Lightbulb,
  ListChecks,
  Menu,
  MoreHorizontal,
  PanelsTopLeft,
  Play,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Publication } from "@/lib/types";

export type MonitorView = "dashboard" | "publications" | "detail";

type MonitorUiProps = {
  publications: Publication[];
  initialView?: MonitorView;
  selectedId?: string;
};

type SourceFilter = "all" | "dof" | "nuevo_leon";
type StatusFilter = "all" | "COMPLETADO" | "ENVIADO" | "PENDIENTE";
type RunState = "idle" | "running" | "success" | "error";

function dateLabel(date: string, compact = false) {
  if (!date) return "Sin fecha";
  const value = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(value.getTime())) return date;
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: compact ? "short" : "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(value).replace(" de ", " ").replace(" de ", ", ");
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

function statusTone(status: string) {
  if (status === "COMPLETADO") return "complete";
  if (status === "ENVIADO") return "analyzing";
  if (status === "PENDIENTE") return "pending";
  return "error";
}

function sourceClass(publication: Publication) {
  return publication.source === "nuevo_leon" ? "nl" : "dof";
}

function editionLabel(publication: Publication) {
  return publication.edition || "Edición sin número";
}

function sourceName(publication: Publication) {
  return publication.sourceLabel || (publication.source === "nuevo_leon" ? "Nuevo León" : "DOF");
}

function SourceMark({ publication, small = false }: { publication: Publication; small?: boolean }) {
  const isNl = sourceClass(publication) === "nl";
  return isNl ? (
    <span className={`monitor-source-mark nl ${small ? "small" : ""}`} aria-label="Nuevo León">
      <span />
      <b>NL</b>
    </span>
  ) : (
    <span className={`monitor-source-mark dof ${small ? "small" : ""}`} aria-label="Diario Oficial de la Federación">✺</span>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = statusTone(status);
  const Icon = tone === "complete" ? Check : tone === "error" ? CircleAlert : tone === "analyzing" ? RefreshCw : Clock3;
  return <span className={`monitor-status-pill ${tone}`}><Icon size={11} />{statusLabel(status)}</span>;
}

function findLatest(publications: Publication[]) {
  return publications.reduce((latest, publication) => publication.date > latest ? publication.date : latest, "");
}

function findLatestSync(publications: Publication[]) {
  return publications.reduce((latest, publication) => {
    if (!publication.updatedAt) return latest;
    if (!latest) return publication.updatedAt;
    return Date.parse(publication.updatedAt) > Date.parse(latest) ? publication.updatedAt : latest;
  }, "");
}

function splitValues(value: string) {
  return value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 6);
}

function firstSentence(value: string) {
  const candidate = value.trim().split(/(?<=[.!?])\s+/)[0];
  return candidate || "No se registró un resumen para esta publicación.";
}

export function MonitorUi({ publications, initialView = "dashboard", selectedId }: MonitorUiProps) {
  const [view, setView] = useState<MonitorView>(initialView);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState(selectedId || publications[0]?.id || "");
  const [menuOpen, setMenuOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [runState, setRunState] = useState<RunState>("idle");
  const [authorization, setAuthorization] = useState("");
  const [runMessage, setRunMessage] = useState("");

  const latestDate = useMemo(() => findLatest(publications), [publications]);
  const latestSync = useMemo(() => findLatestSync(publications), [publications]);
  const pending = useMemo(() => publications.filter((item) => item.status !== "COMPLETADO").length, [publications]);
  const docsCount = useMemo(() => publications.reduce((sum, item) => sum + item.documents.length, 0), [publications]);
  const selectedPublication = useMemo(
    () => publications.find((item) => item.id === selected) || publications[0],
    [publications, selected],
  );

  const filtered = useMemo(() => {
    const term = normalized(query.trim());
    return publications.filter((publication) => {
      if (source !== "all" && publication.source !== source) return false;
      if (status !== "all" && publication.status !== status) return false;
      if (!term) return true;
      return normalized([
        sourceName(publication), publication.date, publication.edition, publication.status,
        publication.analysis.summary, publication.analysis.changes, publication.analysis.agencies,
        publication.analysis.municipalities, ...publication.documents.map((document) => document.name),
      ].join(" ")).includes(term);
    });
  }, [publications, query, source, status]);

  const metricTotal = latestDate ? publications.filter((item) => item.date === latestDate).length : publications.length;
  const latestRows = filtered.slice(0, 5);

  function navigate(next: MonitorView) {
    setView(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openDetail(publication: Publication) {
    setSelected(publication.id);
    navigate("detail");
  }

  function resetFilters() {
    setQuery("");
    setSource("all");
    setStatus("all");
  }

  async function runMonitor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRunState("running");
    setRunMessage("");
    try {
      const response = await fetch("/api/actions/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorization, source: "all", lookback_days: 2 }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo iniciar el workflow.");
      setRunMessage(payload.message || "Revisión iniciada correctamente.");
      setAuthorization("");
      setRunState("success");
    } catch (error) {
      setRunMessage(error instanceof Error ? error.message : "No se pudo iniciar el workflow.");
      setRunState("error");
    }
  }

  const navItems = [
    ["dashboard", "Inicio", Home],
    ["publications", "Publicaciones", FileText],
    ["sources", "Fuentes", Database],
    ["automations", "Automatizaciones", RefreshCw],
    ["log", "Bitácora", ClipboardList],
    ["reports", "Reportes", PanelsTopLeft],
    ["settings", "Ajustes", Settings],
  ] as const;

  return (
    <div className="monitor-ui">
      <div className="monitor-page-backdrop">
        <div className="monitor-shell">
          <aside className={`monitor-sidebar ${menuOpen ? "open" : ""}`}>
            <button type="button" className="monitor-brand" onClick={() => navigate("dashboard")}>
              <span className="monitor-brand-mark"><FileText size={22} /></span>
              <span><strong>Monitor de<br />Diarios Oficiales</strong><small>Información pública.<br />Decisiones más inteligentes.</small></span>
            </button>
            <nav className="monitor-sidebar-nav" aria-label="Navegación principal">
              {navItems.map(([key, label, Icon]) => (
                <button
                  type="button"
                  key={key}
                  className={view === key || (key === "dashboard" && view === "detail") ? "selected" : ""}
                  onClick={() => key === "dashboard" || key === "publications" ? navigate(key) : undefined}
                >
                  <Icon size={18} /><span>{label}</span>
                </button>
              ))}
            </nav>
            <div className="monitor-sidebar-callout">
              <div className="monitor-callout-bars"><i /><i /><i /></div>
              <strong>La normativa<br />también cuenta<br />una historia.</strong>
              <small>Monitorea. Analiza. Actúa.</small>
            </div>
          </aside>

          {menuOpen ? <button className="monitor-menu-overlay" type="button" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} /> : null}

          <div className="monitor-main">
            <header className="monitor-topbar">
              <button type="button" className="monitor-mobile-brand" onClick={() => navigate("dashboard")}><span><FileText size={18} /></span><b>Monitor de<br />Diarios Oficiales</b></button>
              <label className="monitor-global-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar publicaciones, palabras clave, números de edición…" /></label>
              <button type="button" className="monitor-date-control"><CalendarDays size={15} /><span>1 de abr. de 2025</span><b>→</b><span>30 de abr. de 2025</span><ChevronDown size={13} /></button>
              <button type="button" className="monitor-run-button monitor-top-run" onClick={() => { setRunState("idle"); setRunOpen(true); }}><Play size={13} fill="currentColor" />Ejecutar revisión</button>
              <button type="button" className="monitor-top-icon" aria-label="Notificaciones"><Bell size={17} /><i /></button>
              <button type="button" className="monitor-profile"><span>LC</span><b>Laura Campos<small>Analista</small></b><ChevronDown size={13} /></button>
              <button type="button" className="monitor-mobile-menu" aria-label="Abrir menú" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
            </header>

            {view === "dashboard" ? (
              <Dashboard
                total={metricTotal}
                docs={docsCount}
                pending={pending}
                publications={latestRows}
                latestSync={latestSync}
                onPublications={() => navigate("publications")}
                onDetail={openDetail}
                onRun={() => { setRunState("idle"); setRunOpen(true); }}
              />
            ) : null}
            {view === "publications" ? (
              <Publications
                publications={filtered}
                total={publications.length}
                query={query}
                source={source}
                status={status}
                selected={selectedPublication}
                onQuery={setQuery}
                onSource={setSource}
                onStatus={setStatus}
                onReset={resetFilters}
                onDashboard={() => navigate("dashboard")}
                onDetail={openDetail}
              />
            ) : null}
            {view === "detail" && selectedPublication ? <Detail publication={selectedPublication} onPublications={() => navigate("publications")} onRun={() => { setRunState("idle"); setRunOpen(true); }} /> : null}
            <footer className="monitor-footer"><span>Monitor de Diarios Oficiales   v2.0.0</span><div><a>Privacidad</a><a>Términos</a><a>Soporte</a><b><i /> Todos los sistemas operando</b></div></footer>
          </div>

          <nav className="monitor-mobile-nav" aria-label="Navegación móvil">
            <button type="button" className={view === "dashboard" ? "selected" : ""} onClick={() => navigate("dashboard")}><Home size={19} /><span>Inicio</span></button>
            <button type="button" className={view === "publications" || view === "detail" ? "selected" : ""} onClick={() => navigate("publications")}><FileText size={19} /><span>Publicaciones</span></button>
            <button type="button"><RefreshCw size={19} /><span>Automatizaciones</span></button>
            <button type="button"><Settings size={19} /><span>Ajustes</span></button>
          </nav>
        </div>
      </div>

      {runOpen ? (
        <div className="monitor-run-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setRunOpen(false)}>
          <form className="monitor-run-modal" onSubmit={runMonitor}>
            <button type="button" className="monitor-modal-close" onClick={() => setRunOpen(false)} disabled={runState === "running"} aria-label="Cerrar"><X size={18} /></button>
            <span className="monitor-modal-icon"><Play size={18} fill="currentColor" /></span>
            <h2>Ejecutar revisión</h2>
            <p>Inicia la consulta de DOF y del Periódico Oficial de Nuevo León.</p>
            {runState === "success" ? <div className="monitor-run-result success"><CheckCircle2 size={22} /><span>{runMessage}</span></div> : null}
            {runState === "error" ? <div className="monitor-run-result error"><CircleAlert size={22} /><span>{runMessage}</span></div> : null}
            {runState !== "success" ? <label className="monitor-auth-field"><span>Código de autorización</span><input type="password" value={authorization} onChange={(event) => setAuthorization(event.target.value)} placeholder="Código privado de ejecución" autoComplete="off" required disabled={runState === "running"} /></label> : null}
            <div className="monitor-modal-actions"><button type="button" onClick={() => setRunOpen(false)} disabled={runState === "running"}>Cancelar</button><button className="monitor-run-button" type="submit" disabled={runState === "running" || !authorization}>{runState === "running" ? "Iniciando…" : "Ejecutar workflow"}</button></div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function PageHero({ title, subtitle, crumb, back }: { title: string; subtitle: string; crumb?: string; back?: () => void }) {
  return <section className="monitor-hero"><div className="monitor-hero-landscape" aria-hidden="true"><i /><i /><i /></div><div className="monitor-hero-content">{crumb ? <p className="monitor-breadcrumb">{crumb}</p> : <p className="monitor-greeting">Bienvenida, Laura</p>}<h1>{title}</h1><p>{subtitle}</p></div>{back ? <button type="button" className="monitor-hero-back" onClick={back}><ChevronLeft size={14} /> Volver a publicaciones</button> : <span className="monitor-hero-tagline">Información oficial,<br /><em>mayores posibilidades.</em><i /></span>}</section>;
}

function MetricCard({ Icon, tone, value, label, detail }: { Icon: LucideIcon; tone: string; value: number; label: string; detail: string }) {
  return <article className="monitor-metric-card"><span className={`monitor-metric-icon ${tone}`}><Icon size={21} /></span><strong>{value}</strong><span>{label}</span><small>{detail}</small></article>;
}

function Dashboard({ total, docs, pending, publications, latestSync, onPublications, onDetail, onRun }: { total: number; docs: number; pending: number; publications: Publication[]; latestSync: string; onPublications: () => void; onDetail: (publication: Publication) => void; onRun: () => void }) {
  const activity = [
    ["green", "Se completó la sincronización", latestSync ? syncLabel(latestSync) : "Hoy"],
    ["blue", "Se detectaron publicaciones nuevas", `${total} disponibles`],
    ["orange", "Hay elementos por revisar", `${pending} pendientes`],
    ["green", "Proceso automático ejecutado", "Monitor activo"],
  ];
  return <>
    <PageHero title="Panel general" subtitle="Tienes el control de la información más importante del país y de Nuevo León." />
    <main className="monitor-dashboard-content">
      <div className="monitor-dashboard-layout">
        <div className="monitor-primary-column">
          <section className="monitor-metrics-row"><MetricCard Icon={FileText} tone="blue" value={total} label="Nuevas publicaciones" detail="↑ corte más reciente" /><MetricCard Icon={Download} tone="green" value={docs} label="PDFs disponibles" detail="↑ documentos indexados" /><MetricCard Icon={Clock3} tone="orange" value={pending} label="Pendientes de análisis" detail="↓ requieren seguimiento" /></section>
          <div className="monitor-mobile-tabs"><button className="selected">Todas</button><button>DOF</button><button>Nuevo León</button></div>
          <section className="monitor-panel monitor-recent-panel"><div className="monitor-panel-title"><span className="blue"><FileText size={16} /></span><h2>Publicaciones recientes</h2><button type="button" onClick={onPublications}>Ver todas</button></div><div className="monitor-table-wrap"><table><thead><tr><th>Fuente</th><th>Fecha</th><th>Edición</th><th>Partes / PDF</th><th>Estado</th><th>Última acción</th><th /></tr></thead><tbody>{publications.map((item) => <tr key={item.id} onClick={() => onDetail(item)}><td><SourceMark publication={item} small /><b>{sourceName(item)}</b></td><td>{dateLabel(item.date, true)}</td><td>{editionLabel(item)}</td><td>{item.documents.length}</td><td><StatusPill status={item.status} /></td><td>{syncLabel(item.updatedAt)}</td><td><MoreHorizontal size={16} /></td></tr>)}</tbody></table></div><div className="monitor-mobile-list">{publications.map((item) => <button type="button" key={item.id} onClick={() => onDetail(item)}><SourceMark publication={item} small /><span><b>{sourceName(item)}</b><small>{dateLabel(item.date, true)} · {editionLabel(item)}</small></span><StatusPill status={item.status} /><ChevronRight size={15} /></button>)}</div></section>
        </div>
        <aside className="monitor-dashboard-side"><section className="monitor-panel monitor-activity-panel"><div className="monitor-panel-title"><span className="dark"><Zap size={16} /></span><h2>Actividad reciente</h2><button type="button">Ver todo</button></div><ol>{activity.map(([tone, text, time]) => <li key={text}><i className={tone} /><div><b>{text}</b><small>{time}</small></div></li>)}</ol></section><section className="monitor-panel monitor-schedule"><div className="monitor-panel-title"><span className="light"><CalendarDays size={16} /></span><h2>Programación</h2><button type="button">Editar</button></div><ScheduleRow time="07:00" text="Revisión diaria DOF" /><ScheduleRow time="07:30" text="Revisión diaria Nuevo León" /><button type="button" className="monitor-run-button monitor-mobile-run" onClick={onRun}><Play size={13} fill="currentColor" /> Ejecutar revisión</button></section></aside>
      </div>
      <section className="monitor-panel monitor-quick-actions"><div className="monitor-panel-title"><span className="dark"><Zap size={15} /></span><h2>Acciones rápidas</h2></div><div><button type="button" className="accent" onClick={onRun}><Upload size={20} /><span><b>Subir PDF</b><small>Analiza un documento manualmente</small></span></button><button type="button"><span className="round"><ListChecks size={18} /></span><span><b>Ver bitácora</b><small>Consulta el historial de procesos</small></span></button><button type="button" className="mint"><span className="round"><ExternalLink size={18} /></span><span><b>Abrir hoja compartida</b><small>Revisa los resultados en tiempo real</small></span></button></div></section>
    </main>
  </>;
}

function ScheduleRow({ time, text }: { time: string; text: string }) {
  const [active, setActive] = useState(true);
  return <div className="monitor-schedule-row"><b>{time}</b><span><strong>{text}</strong><small>Descarga y análisis automático</small></span><button type="button" className={`monitor-switch ${active ? "active" : ""}`} onClick={() => setActive((value) => !value)} aria-label={`Activar ${text}`}><i /></button></div>;
}

function Publications({ publications, total, query, source, status, selected, onQuery, onSource, onStatus, onReset, onDashboard, onDetail }: { publications: Publication[]; total: number; query: string; source: SourceFilter; status: StatusFilter; selected?: Publication; onQuery: (value: string) => void; onSource: (value: SourceFilter) => void; onStatus: (value: StatusFilter) => void; onReset: () => void; onDashboard: () => void; onDetail: (publication: Publication) => void }) {
  const dof = publications.filter((item) => item.source === "dof").length;
  const nl = publications.filter((item) => item.source === "nuevo_leon").length;
  return <>
    <PageHero crumb="Inicio   ›   Publicaciones" title="Publicaciones" subtitle="Revisa y organiza las ediciones de los diarios oficiales del país y de Nuevo León." />
    <main className="monitor-publications-content">
      <section className="monitor-filter-panel"><button type="button"><FileText size={14} />Todas<ChevronDown size={13} /></button><button type="button"><CalendarDays size={14} />1 de abr. de 2025   →   30 de abr. de 2025<ChevronDown size={13} /></button><button type="button"><SlidersHorizontal size={14} />Todos los estados<ChevronDown size={13} /></button><label><Search size={14} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Buscar en publicaciones…" /></label><button type="button" className="export"><Download size={15} />Exportar<ChevronDown size={13} /></button></section>
      <div className="monitor-publication-tabs"><button type="button" className={source === "all" && status === "all" ? "selected" : ""} onClick={onReset}><i className="blue" />Todas<b>{total}</b></button><button type="button" className={source === "dof" ? "selected" : ""} onClick={() => onSource("dof")}><i className="blue" />DOF<b>{dof}</b></button><button type="button" className={source === "nuevo_leon" ? "selected" : ""} onClick={() => onSource("nuevo_leon")}><i className="orange" />Nuevo León<b>{nl}</b></button><button type="button" className={status === "PENDIENTE" ? "selected" : ""} onClick={() => onStatus("PENDIENTE")}><i className="orange" />Pendientes</button><button type="button" className={status === "COMPLETADO" ? "selected" : ""} onClick={() => onStatus("COMPLETADO")}><i className="green" />Completadas</button></div>
      <div className="monitor-publications-grid"><div><section className="monitor-source-summary"><article><MetricCard Icon={FileText} tone="blue" value={total} label="Total de publicaciones" detail="↑ corte consultado" /></article><article><span className="monitor-source-mark dof">✺</span><strong>DOF</strong><b>{dof}</b><small>{total ? Math.round((dof / total) * 100) : 0}% del total</small></article><article><span className="monitor-source-mark nl"><span /><b>NL</b></span><strong>Nuevo León</strong><b>{nl}</b><small>{total ? Math.round((nl / total) * 100) : 0}% del total</small></article></section><section className="monitor-panel monitor-publications-table"><div className="monitor-table-wrap"><table><thead><tr><th>⌄</th><th>Fuente</th><th>Fecha</th><th>Edición</th><th>Documento ID</th><th>Archivos</th><th>Estado</th><th>Responsable</th><th>Última actualización</th><th>Acciones</th></tr></thead><tbody>{publications.map((item) => <tr key={item.id} onClick={() => onDetail(item)}><td>›</td><td><SourceMark publication={item} small /><b>{sourceName(item)}</b></td><td>{dateLabel(item.date, true)}</td><td>{editionLabel(item)}</td><td>{item.id}</td><td><FileText size={13} /> {item.documents.length}</td><td><StatusPill status={item.status} /></td><td>{item.status === "COMPLETADO" ? "Analista" : "Sistema"}</td><td>{syncLabel(item.updatedAt)}</td><td><MoreHorizontal size={16} /></td></tr>)}{!publications.length ? <tr><td colSpan={10} className="monitor-empty-row">No hay publicaciones que coincidan con los filtros.</td></tr> : null}</tbody></table></div><div className="monitor-table-footer"><span>Mostrando {publications.length} de {total} publicaciones</span><div><button>‹</button><button className="current">1</button><button>2</button><button>3</button><button>›</button></div></div></section></div>{selected ? <QuickView publication={selected} onDetail={() => onDetail(selected)} /> : null}</div>
      <button type="button" className="monitor-back-dashboard" onClick={onDashboard}><ChevronLeft size={15} /> Volver al panel</button>
    </main>
  </>;
}

function QuickView({ publication, onDetail }: { publication: Publication; onDetail: () => void }) {
  const doc = publication.documents[0];
  return <aside className="monitor-quick-view"><div className="monitor-panel-title"><span className="dark"><FileText size={15} /></span><h2>Vista rápida</h2><button type="button"><X size={15} /></button></div><div className="monitor-quick-source"><SourceMark publication={publication} /><div><b>{sourceName(publication)}</b><small>{publication.source === "dof" ? "Diario Oficial de la Federación" : "Periódico Oficial del Estado"}</small></div><StatusPill status={publication.status} /></div><h3>{editionLabel(publication)}</h3><p>{dateLabel(publication.date)}<br /><small>{publication.documents.length} archivos disponibles</small></p><dl><div><dt><CalendarDays size={15} /> Fecha de publicación</dt><dd>{dateLabel(publication.date)}</dd></div><div><dt><FileText size={15} /> Documento ID</dt><dd>{publication.id}</dd></div><div><dt><FileText size={15} /> Total de partes</dt><dd>{publication.documents.length} (PDF)</dd></div><div><dt>#   SHA-256</dt><dd>{doc?.sha256 ? `${doc.sha256.slice(0, 13)}…${doc.sha256.slice(-8)}` : "Sin hash"} <Copy size={13} /></dd></div><div><dt><Clock3 size={15} /> Última actualización</dt><dd>{syncLabel(publication.updatedAt)}</dd></div></dl><div className="monitor-tags">{splitValues(publication.analysis.agencies || publication.analysis.municipalities || "Normativa, Oficial").slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}</div><div className="monitor-quick-buttons"><button type="button" className="monitor-run-button" onClick={onDetail}><FileText size={14} /> Abrir detalle</button><button type="button"><RefreshCw size={14} /> Reprocesar</button></div></aside>;
}

function Detail({ publication, onPublications, onRun }: { publication: Publication; onPublications: () => void; onRun: () => void }) {
  const document = publication.documents[0];
  const agencies = splitValues(publication.analysis.agencies);
  const municipalities = splitValues(publication.analysis.municipalities);
  const topics = splitValues([publication.analysis.construction, publication.analysis.urbanism, publication.analysis.infrastructure, publication.analysis.housing, publication.analysis.landUse].filter(Boolean).join(","));
  const findings = [publication.analysis.summary, publication.analysis.changes, publication.analysis.modifiesPrevious, publication.analysis.historicalComparison].filter((item) => item?.trim()).map(firstSentence).slice(0, 5);
  return <>
    <PageHero crumb="Inicio   ›   Publicaciones   ›   Detalle de publicación" title="Detalle de publicación" subtitle="Consulta el contenido y análisis de esta edición del Diario Oficial." back={onPublications} />
    <main className="monitor-detail-content"><div className="monitor-detail-navigation"><button type="button"><ChevronLeft size={14} /> Publicación anterior</button><button type="button">Siguiente publicación <ChevronRight size={14} /></button></div><div className="monitor-detail-grid"><PdfViewer publication={publication} documentUrl={document?.pdfDriveUrl || document?.sourceUrl} /><div className="monitor-detail-side"><section className="monitor-detail-card monitor-information"><div className="monitor-detail-title"><FileText size={16} /><h2>Información general</h2><StatusPill status={publication.status} /></div><dl><div><dt>Fuente</dt><dd><SourceMark publication={publication} small />{sourceName(publication)}</dd></div><div><dt>Edición</dt><dd>{editionLabel(publication)}</dd></div><div><dt>Fecha</dt><dd>{dateLabel(publication.date)}</dd></div><div><dt>Partes / PDF</dt><dd>{publication.documents.length}</dd></div><div><dt>Estado</dt><dd><StatusPill status={publication.status} /></dd></div><div><dt>Hash SHA</dt><dd>{document?.sha256 ? `${document.sha256.slice(0, 13)}…${document.sha256.slice(-8)}` : "Sin hash"}<Copy size={14} /></dd></div></dl></section><section className="monitor-detail-card"><div className="monitor-detail-title"><ClipboardList size={16} /><h2>Resumen ejecutivo</h2><button type="button"><Sparkles size={12} /> Generado por IA</button></div><p className="monitor-executive-copy">{publication.analysis.summary || "El análisis estará disponible cuando finalice el procesamiento del documento."}</p></section><section className="monitor-detail-card"><div className="monitor-detail-title"><ListChecks size={16} /><h2>Entidades detectadas</h2><button type="button">Ver todas</button></div><div className="monitor-entity-columns"><EntityGroup label="Dependencias" items={agencies} fallback="No detectadas" /><EntityGroup label="Municipios" items={municipalities} fallback="No detectados" /><EntityGroup label="Temas" items={topics} fallback="En análisis" /></div></section><section className="monitor-detail-card"><div className="monitor-detail-title"><Lightbulb size={16} /><h2>Hallazgos clave</h2></div><ol className="monitor-findings">{(findings.length ? findings : ["El documento está en proceso de análisis."]).map((finding, index) => <li key={`${finding}-${index}`}><i>{index + 1}</i><span>{finding}</span></li>)}</ol></section><div className="monitor-detail-bottom"><History publication={publication} /><section className="monitor-detail-card monitor-actions"><div className="monitor-detail-title"><Zap size={16} /><h2>Acciones</h2></div>{document?.pdfDriveUrl ? <a className="monitor-run-button" href={document.pdfDriveUrl} target="_blank" rel="noreferrer"><Download size={14} /> Descargar PDF</a> : <button className="monitor-run-button" type="button" onClick={onRun}><Download size={14} /> Descargar PDF</button>} {document?.mdDriveUrl ? <a href={document.mdDriveUrl} target="_blank" rel="noreferrer"><FileText size={14} /> Abrir Markdown</a> : null}<button type="button" onClick={onRun}><ClipboardList size={14} /> Enviar a hoja</button><button type="button" className="success"><Check size={14} /> Marcar como completado</button></section></div></div></div></main>
  </>;
}

function PdfViewer({ publication, documentUrl }: { publication: Publication; documentUrl?: string }) {
  return <section className="monitor-pdf-card"><div className="monitor-pdf-heading"><div><SourceMark publication={publication} /><span><b>{sourceName(publication)} · {editionLabel(publication)}</b><small>{dateLabel(publication.date)}</small></span></div><StatusPill status={publication.status} /></div><div className="monitor-pdf-shell"><div className="monitor-pdf-toolbar"><PanelsTopLeft size={14} /><b>1</b><span>/ {Math.max(publication.documents.length, 1)}</span><button type="button">−</button><b>100%</b><button type="button">+</button><i /><button type="button"><RefreshCw size={15} /></button>{documentUrl ? <a href={documentUrl} target="_blank" rel="noreferrer"><Download size={15} /></a> : <button type="button"><Download size={15} /></button>}</div><div className="monitor-pdf-body"><div className="monitor-pdf-thumbs">{Array.from({ length: Math.min(Math.max(publication.documents.length, 2), 5) }, (_, index) => <span className={index === 0 ? "selected" : ""} key={index}><i>✺</i><b>DIARIO<br />OFICIAL</b><small>{index + 1}</small></span>)}</div><div className="monitor-pdf-preview"><div className="monitor-pdf-page"><i>✺</i><strong>ESTADOS UNIDOS MEXICANOS</strong><h2>{sourceName(publication) === "DOF" ? "DIARIO OFICIAL\nDE LA FEDERACIÓN" : "PERIÓDICO OFICIAL\nDEL ESTADO"}</h2><small>ÓRGANO DE DIFUSIÓN OFICIAL</small><p>{editionLabel(publication)}   {dateLabel(publication.date)}</p><h3>CONTENIDO</h3><b>{publication.documents.length ? publication.documents.map((item) => item.name).join("\n") : "Documento en proceso de carga"}</b><footer>Índice y disposiciones<br />oficiales</footer></div></div></div></div></section>;
}

function EntityGroup({ label, items, fallback }: { label: string; items: string[]; fallback: string }) {
  return <div><b>{label} ({items.length})</b>{(items.length ? items : [fallback]).map((item) => <span key={item}>{item}</span>)}</div>;
}

function History({ publication }: { publication: Publication }) {
  return <section className="monitor-detail-card monitor-history"><div className="monitor-history-head"><div><span><Clock3 size={15} /></span><b>Historial del procesamiento</b></div><button type="button">Ver detalles</button></div><ul><li><i /><span>PDF descargado</span><time>{syncLabel(publication.updatedAt)}</time></li><li><i /><span>OCR completado</span><time>Procesado</time></li><li><i /><span>Análisis con IA</span><time>{publication.status === "COMPLETADO" ? "Completado" : "Pendiente"}</time></li><li><i /><span>Enviado a hoja de cálculo</span><time>{publication.status}</time></li></ul></section>;
}
