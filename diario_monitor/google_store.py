from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload


FOLDER_MIME = "application/vnd.google-apps.folder"
PDF_MIME = "application/pdf"
MD_MIME = "text/markdown"

HEADERS = [
    "Documento ID",
    "Fecha",
    "Fuente",
    "Edición / Número",
    "Parte",
    "Nombre base",
    "URL origen",
    "SHA256",
    "PDF File ID",
    "PDF Drive",
    "MD File ID",
    "MD Drive",
    "Revisión",
    "OCR Estado",
    "IA Estado",
    "Cambio",
    "Actualizado UTC",
    "Verificado UTC",
]


def _a1_col(number: int) -> str:
    value = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        value = chr(65 + remainder) + value
    return value


LAST_COL = _a1_col(len(HEADERS))


@dataclass(slots=True)
class RegistryRow:
    row_number: int
    values: list[str]

    def get(self, column: str) -> str:
        try:
            index = HEADERS.index(column)
        except ValueError as exc:
            raise KeyError(column) from exc
        return self.values[index] if index < len(self.values) else ""


class GoogleStore:
    def __init__(
        self,
        *,
        service_account_json: str,
        spreadsheet_id: str,
        sheet_tab: str,
        root_folder_id: str,
    ) -> None:
        info = json.loads(service_account_json)
        credentials = service_account.Credentials.from_service_account_info(
            info,
            scopes=[
                "https://www.googleapis.com/auth/drive",
                "https://www.googleapis.com/auth/spreadsheets",
            ],
        )
        self.drive = build("drive", "v3", credentials=credentials, cache_discovery=False)
        self.sheets = build("sheets", "v4", credentials=credentials, cache_discovery=False)
        self.spreadsheet_id = spreadsheet_id
        self.sheet_tab = sheet_tab
        self.root_folder_id = root_folder_id
        self._rows: dict[str, RegistryRow] = {}
        self._folder_cache: dict[tuple[str, str], str] = {}

    def initialize(self) -> None:
        self._ensure_sheet_tab()
        self._ensure_headers()
        self.refresh_registry()
        # Falla rápido si la cuenta de servicio no tiene acceso a la carpeta.
        self.drive.files().get(
            fileId=self.root_folder_id,
            fields="id,name,mimeType",
            supportsAllDrives=True,
        ).execute()

    def _ensure_sheet_tab(self) -> None:
        metadata = self.sheets.spreadsheets().get(
            spreadsheetId=self.spreadsheet_id,
            fields="sheets.properties",
        ).execute()
        names = {item["properties"]["title"] for item in metadata.get("sheets", [])}
        if self.sheet_tab in names:
            return
        self.sheets.spreadsheets().batchUpdate(
            spreadsheetId=self.spreadsheet_id,
            body={"requests": [{"addSheet": {"properties": {"title": self.sheet_tab}}}]},
        ).execute()

    def _ensure_headers(self) -> None:
        response = self.sheets.spreadsheets().values().get(
            spreadsheetId=self.spreadsheet_id,
            range=f"'{self.sheet_tab}'!A1:{LAST_COL}1",
        ).execute()
        current = (response.get("values") or [[]])[0]
        if current == HEADERS:
            return
        if any(str(value).strip() for value in current):
            raise RuntimeError(
                f"La pestaña {self.sheet_tab!r} tiene encabezados distintos. "
                "Use una pestaña vacía o cambie GOOGLE_SHEET_TAB."
            )
        self.sheets.spreadsheets().values().update(
            spreadsheetId=self.spreadsheet_id,
            range=f"'{self.sheet_tab}'!A1:{LAST_COL}1",
            valueInputOption="RAW",
            body={"values": [HEADERS]},
        ).execute()

    def refresh_registry(self) -> None:
        response = self.sheets.spreadsheets().values().get(
            spreadsheetId=self.spreadsheet_id,
            range=f"'{self.sheet_tab}'!A2:{LAST_COL}",
        ).execute()
        rows = response.get("values", [])
        self._rows.clear()
        for row_number, values in enumerate(rows, start=2):
            if not values:
                continue
            document_id = values[0].strip() if values else ""
            if document_id:
                self._rows[document_id] = RegistryRow(row_number, list(values))

    def find(self, document_id: str) -> RegistryRow | None:
        return self._rows.get(document_id)

    def ensure_folder(self, parent_id: str, name: str) -> str:
        key = (parent_id, name)
        if key in self._folder_cache:
            return self._folder_cache[key]

        escaped = name.replace("'", "\\'")
        query = (
            f"'{parent_id}' in parents and name = '{escaped}' and "
            f"mimeType = '{FOLDER_MIME}' and trashed = false"
        )
        response = self.drive.files().list(
            q=query,
            spaces="drive",
            fields="files(id,name)",
            pageSize=10,
            includeItemsFromAllDrives=True,
            supportsAllDrives=True,
        ).execute()
        files = response.get("files", [])
        if files:
            folder_id = files[0]["id"]
        else:
            created = self.drive.files().create(
                body={"name": name, "mimeType": FOLDER_MIME, "parents": [parent_id]},
                fields="id",
                supportsAllDrives=True,
            ).execute()
            folder_id = created["id"]

        self._folder_cache[key] = folder_id
        return folder_id

    def document_folder(self, *, source: str, year: int, month: int) -> str:
        source_name = "DOF" if source == "dof" else "Nuevo Leon"
        source_id = self.ensure_folder(self.root_folder_id, source_name)
        year_id = self.ensure_folder(source_id, f"{year:04d}")
        return self.ensure_folder(year_id, f"{month:02d}")

    def create_file(self, path: Path, *, parent_id: str, mime_type: str) -> dict[str, str]:
        media = MediaFileUpload(str(path), mimetype=mime_type, resumable=True)
        return self.drive.files().create(
            body={"name": path.name, "parents": [parent_id]},
            media_body=media,
            fields="id,name,webViewLink",
            supportsAllDrives=True,
        ).execute()

    def update_file(self, file_id: str, path: Path, *, mime_type: str) -> dict[str, str]:
        media = MediaFileUpload(str(path), mimetype=mime_type, resumable=True)
        return self.drive.files().update(
            fileId=file_id,
            body={"name": path.name},
            media_body=media,
            fields="id,name,webViewLink",
            supportsAllDrives=True,
        ).execute()

    @staticmethod
    def drive_url(file_id: str, response: dict[str, Any] | None = None) -> str:
        if response and response.get("webViewLink"):
            return str(response["webViewLink"])
        return f"https://drive.google.com/file/d/{file_id}/view"

    def upsert_registry(
        self,
        *,
        document_id: str,
        publication_date: str,
        source: str,
        edition_or_number: str,
        part: str,
        base_name: str,
        source_url: str,
        sha256: str,
        pdf_file_id: str,
        pdf_url: str,
        md_file_id: str,
        md_url: str,
        revision: int,
        change: str,
    ) -> None:
        now = datetime.now(UTC).isoformat(timespec="seconds")
        values = [
            document_id,
            publication_date,
            source,
            edition_or_number,
            part,
            base_name,
            source_url,
            sha256,
            pdf_file_id,
            pdf_url,
            md_file_id,
            md_url,
            str(revision),
            "COMPLETADO",
            "PENDIENTE",
            change,
            now,
            now,
        ]
        existing = self.find(document_id)
        if existing:
            self.sheets.spreadsheets().values().update(
                spreadsheetId=self.spreadsheet_id,
                range=f"'{self.sheet_tab}'!A{existing.row_number}:{LAST_COL}{existing.row_number}",
                valueInputOption="RAW",
                body={"values": [values]},
            ).execute()
            self._rows[document_id] = RegistryRow(existing.row_number, values)
        else:
            result = self.sheets.spreadsheets().values().append(
                spreadsheetId=self.spreadsheet_id,
                range=f"'{self.sheet_tab}'!A:{LAST_COL}",
                valueInputOption="RAW",
                insertDataOption="INSERT_ROWS",
                body={"values": [values]},
            ).execute()
            self.refresh_registry()

    def mark_verified_unchanged(self, document_id: str) -> None:
        existing = self.find(document_id)
        if not existing:
            return
        now = datetime.now(UTC).isoformat(timespec="seconds")
        self.sheets.spreadsheets().values().update(
            spreadsheetId=self.spreadsheet_id,
            range=f"'{self.sheet_tab}'!R{existing.row_number}",
            valueInputOption="RAW",
            body={"values": [[now]]},
        ).execute()
        if len(existing.values) < len(HEADERS):
            existing.values.extend([""] * (len(HEADERS) - len(existing.values)))
        existing.values[17] = now
