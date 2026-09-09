import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import "./analysis-detail.css";
import "./mobile-ui.css";
import "./monitor-ui.css";
import "./monitor-v3.css";
import "./latest-report.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: { default: "Diarios Oficiales", template: "%s · Diarios Oficiales" },
  description: "Consulta de DOF y Periódico Oficial de Nuevo León con análisis de vivienda.",
  applicationName: "Diarios Oficiales",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f4f7fb" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="es"><body className={`${inter.variable} ${newsreader.variable}`}>{children}</body></html>;
}
