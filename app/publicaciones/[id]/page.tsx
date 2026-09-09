import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MonitorUiV3 } from "@/components/monitor-ui-v3";
import { getPublication } from "@/lib/publications";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const publication = await getPublication(decodeURIComponent(id));
  return publication ? { title: `${publication.sourceLabel} · ${publication.date}` } : { title: "Publicación" };
}

export default async function PublicationPage({ params }: PageProps) {
  const { id } = await params;
  const publication = await getPublication(decodeURIComponent(id));
  if (!publication) notFound();
  return <MonitorUiV3 publications={[publication]} initialView="detail" selectedId={publication.id} />;
}