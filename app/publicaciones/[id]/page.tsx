import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { PublicationDetail } from "@/components/publication-detail";
import { getPublication } from "@/lib/publications";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

function dateLabel(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(value.getTime())) return date;
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const publication = await getPublication(decodeURIComponent(id));
  if (!publication) return { title: "Publicación" };
  return { title: `${publication.sourceLabel} · ${publication.date}` };
}

export default async function PublicationPage({ params }: PageProps) {
  const { id } = await params;
  const publication = await getPublication(decodeURIComponent(id));
  if (!publication) return notFound();

  const relevant = /^(si|sí)$/i.test(publication.analysis.relevant.trim());
  const complete = publication.status === "COMPLETADO";

  return (
    <main className="shell detail-shell">
      <header className="detail-nav">
        <Link href="/">
          <ArrowLeft size={17} /> Volver a publicaciones
        </Link>
        <span>Diarios Oficiales</span>
      </header>

      <section className="detail-hero">
        <div>
          <p className="detail-source">{publication.sourceLabel}</p>
          <h1>{publication.edition}</h1>
          <p className="detail-date">{dateLabel(publication.date)}</p>
        </div>
        <div className="detail-status-stack">
          <span className={`status ${complete ? "complete" : "pending"}`}>
            <Sparkles size={14} /> {complete ? "Análisis completado" : "Análisis en proceso"}
          </span>
          {relevant && <span className="relevant-label">Relevante para vivienda</span>}
        </div>
      </section>

      <PublicationDetail publication={publication} />
    </main>
  );
}
