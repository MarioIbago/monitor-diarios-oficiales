import { NextResponse } from "next/server";
import { getPublications } from "@/lib/publications";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const publications = await getPublications();
    return NextResponse.json(publications, {
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar las publicaciones." },
      { status: 500 },
    );
  }
}
