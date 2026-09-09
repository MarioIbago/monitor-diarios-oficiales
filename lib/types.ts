export type SourceKey = "dof" | "nuevo_leon" | string;

export type PublicationDocument = {
  id: string;
  name: string;
  part: string;
  pdfFileId: string | null;
  pdfDriveUrl: string;
  mdFileId: string | null;
  mdDriveUrl: string;
  sourceUrl: string;
  sha256: string;
};

export type PublicationAnalysis = {
  relevant: string;
  mobility: string;
  construction: string;
  urbanism: string;
  infrastructure: string;
  housing: string;
  landUse: string;
  permits: string;
  municipalities: string;
  agencies: string;
  summary: string;
  changes: string;
  modifiesPrevious: string;
  historicalComparison: string;
};

export type Publication = {
  id: string;
  source: SourceKey;
  sourceLabel: string;
  date: string;
  edition: string;
  status: "COMPLETADO" | "ENVIADO" | "PENDIENTE" | string;
  updatedAt: string;
  documents: PublicationDocument[];
  analysis: PublicationAnalysis;
};
