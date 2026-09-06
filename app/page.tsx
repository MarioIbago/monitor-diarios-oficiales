import { MonitorUi } from "@/components/monitor-ui";
import { getPublications } from "@/lib/publications";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  try {
    const publications = await getPublications();
    return <MonitorUi publications={publications} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron cargar los datos.";
    return (
      <main className="shell error-page">
        <div className="error-panel">
          <span className="brand-mark">D</span>
          <h1>No pude conectar con el registro.</h1>
          <p>{message}</p>
          <p className="muted">Revisa las variables de entorno de Vercel y que la Service Account tenga acceso al Sheet.</p>
        </div>
      </main>
    );
  }
}
