from __future__ import annotations

import tempfile
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from .google_store import GoogleStore, MD_MIME, PDF_MIME
from .http import HttpClient
from .models import Document, Issue
from .naming import base_filename, stable_document_id
from .ocr import pdf_to_markdown



@dataclass(slots=True)
class Summary:
    issues_seen: int = 0
    documents_seen: int = 0
    new: int = 0
    changed: int = 0
    unchanged: int = 0
    failed: int = 0
    errors: list[str] = field(default_factory=list)


class Pipeline:
    def __init__(
        self,
        *,
        client: HttpClient,
        store: GoogleStore,
        sources: list[object],
        ocr_dpi: int = 150,
        ocr_workers: int = 4,
    ) -> None:
        self.client = client
        self.store = store
        self.sources = sources
        self.ocr_dpi = ocr_dpi
        self.ocr_workers = ocr_workers

    def run(self, start: date, end: date) -> Summary:
        self.store.initialize()
        summary = Summary()

        for source in self.sources:
            try:
                issues = source.discover(start, end)
            except Exception as exc:
                summary.failed += 1
                summary.errors.append(f"{getattr(source, 'key', 'source')}: {type(exc).__name__}: {exc}")
                continue

            for issue in issues:
                summary.issues_seen += 1
                for document in issue.documents:
                    summary.documents_seen += 1
                    try:
                        state = self._process_document(issue, document)
                        setattr(summary, state, getattr(summary, state) + 1)
                    except Exception as exc:
                        summary.failed += 1
                        summary.errors.append(
                            f"{stable_document_id(issue, document)}: {type(exc).__name__}: {exc}"
                        )
        return summary

    def _process_document(self, issue: Issue, document: Document) -> str:
        document_id = stable_document_id(issue, document)
        existing = self.store.find(document_id)
        base = base_filename(issue, document)

        with tempfile.TemporaryDirectory(prefix="diario_") as tmp:
            tmpdir = Path(tmp)
            pdf_path = tmpdir / f"{base}.pdf"
            md_path = tmpdir / f"{base}.md"

            download = self.client.download_pdf(document.url, pdf_path)

            if existing and existing.get("SHA256") == download.sha256:
                # No escribir nada en Sheets: así Workspace Studio NO vuelve a dispararse.
                print(f"UNCHANGED {document_id} {download.sha256[:12]}")
                return "unchanged"

            print(f"OCR {document_id}: {pdf_path.name}")
            page_count = pdf_to_markdown(
                pdf_path,
                md_path,
                dpi=self.ocr_dpi,
                max_workers=self.ocr_workers,
            )
            print(f"OCR OK {document_id}: {page_count} páginas")

            folder_id = self.store.document_folder(
                source=issue.source,
                year=issue.publication_date.year,
                month=issue.publication_date.month,
            )

            if existing and existing.get("PDF File ID") and existing.get("MD File ID"):
                pdf_response = self.store.update_file(
                    existing.get("PDF File ID"), pdf_path, mime_type=PDF_MIME
                )
                md_response = self.store.update_file(
                    existing.get("MD File ID"), md_path, mime_type=MD_MIME
                )
                pdf_file_id = pdf_response["id"]
                md_file_id = md_response["id"]
                revision = int(existing.get("Revisión") or "1") + 1
                change = "ACTUALIZADO"
                state = "changed"
            else:
                pdf_response = self.store.create_file(
                    pdf_path, parent_id=folder_id, mime_type=PDF_MIME
                )
                md_response = self.store.create_file(
                    md_path, parent_id=folder_id, mime_type=MD_MIME
                )
                pdf_file_id = pdf_response["id"]
                md_file_id = md_response["id"]
                revision = 1
                change = "NUEVO"
                state = "new"

            self.store.upsert_registry(
                document_id=document_id,
                publication_date=issue.publication_date.isoformat(),
                source=issue.source,
                edition_or_number=(issue.edition or issue.issue_number or ""),
                part=str(document.part_number or ""),
                base_name=base,
                source_url=document.url,
                sha256=download.sha256,
                pdf_file_id=pdf_file_id,
                pdf_url=self.store.drive_url(pdf_file_id, pdf_response),
                md_file_id=md_file_id,
                md_url=self.store.drive_url(md_file_id, md_response),
                revision=revision,
                change=change,
            )
            print(f"{change} {document_id} -> Drive / Sheet")
            return state
