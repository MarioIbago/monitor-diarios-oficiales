import "server-only";
import { GoogleAuth } from "google-auth-library";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];

let authInstance: GoogleAuth | null = null;

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
  [key: string]: unknown;
};

function readCredentials(): ServiceAccountCredentials {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    throw new Error("Falta GOOGLE_SERVICE_ACCOUNT_JSON en las variables de entorno.");
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccountCredentials>;
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("El JSON de Service Account no contiene client_email/private_key.");
    }
    return parsed as ServiceAccountCredentials;
  } catch (error) {
    if (error instanceof Error && error.message.includes("client_email/private_key")) throw error;
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON no contiene JSON válido. Pega el archivo completo en una sola variable.",
    );
  }
}

function getAuth() {
  if (!authInstance) {
    authInstance = new GoogleAuth({ credentials: readCredentials(), scopes: SCOPES });
  }
  return authInstance;
}

export async function getGoogleAccessToken(): Promise<string> {
  const client = await getAuth().getClient();
  const result = await client.getAccessToken();
  const token = typeof result === "string" ? result : result?.token;
  if (!token) throw new Error("Google no devolvió un access token.");
  return token;
}

export async function getSheetValues(a1Range: string): Promise<string[][]> {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (!spreadsheetId) throw new Error("Falta GOOGLE_SHEET_ID.");

  const token = await getGoogleAccessToken();
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(a1Range)}`,
  );
  url.searchParams.set("majorDimension", "ROWS");
  url.searchParams.set("valueRenderOption", "FORMATTED_VALUE");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`No se pudo leer Google Sheets (${response.status}).`);
  }

  const data = (await response.json()) as { values?: string[][] };
  return data.values ?? [];
}

export async function getDriveFileMetadata(fileId: string) {
  const token = await getGoogleAccessToken();
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", "id,name,mimeType,size,modifiedTime");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`No se pudo leer metadata de Drive (${response.status}).`);
  return (await response.json()) as {
    id: string;
    name: string;
    mimeType?: string;
    size?: string;
    modifiedTime?: string;
  };
}

export async function fetchDriveFile(fileId: string, range?: string | null) {
  const token = await getGoogleAccessToken();
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");

  const headers = new Headers({ Authorization: `Bearer ${token}` });
  if (range) headers.set("Range", range);

  return fetch(url, {
    headers,
    cache: "no-store",
  });
}
