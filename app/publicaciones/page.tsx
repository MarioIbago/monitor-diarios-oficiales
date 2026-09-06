import { MonitorUi } from "@/components/monitor-ui";
import { getPublications } from "@/lib/publications";

export const dynamic = "force-dynamic";

export default async function PublicationsPage() {
  const publications = await getPublications();
  return <MonitorUi publications={publications} initialView="publications" />;
}
