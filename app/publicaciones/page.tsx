import { MonitorUiV3 } from "@/components/monitor-ui-v3";
import { getPublications } from "@/lib/publications";

export const dynamic = "force-dynamic";

export default async function PublicationsPage() {
  const publications = await getPublications();
  return <MonitorUiV3 publications={publications} initialView="publications" />;
}