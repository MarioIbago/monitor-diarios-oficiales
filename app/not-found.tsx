import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell error-page">
      <div className="error-panel">
        <span className="brand-mark">D</span>
        <h1>Publicación no encontrada.</h1>
        <p>Es posible que haya sido reemplazada o que el identificador no exista.</p>
        <Link className="primary-link" href="/">Volver al inicio</Link>
      </div>
    </main>
  );
}
