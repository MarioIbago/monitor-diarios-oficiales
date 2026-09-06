import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Diarios Oficiales",
    short_name: "Diarios",
    description: "DOF y Periódico Oficial de Nuevo León con análisis de vivienda.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7f4",
    theme_color: "#173f35",
    lang: "es-MX",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
