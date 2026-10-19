from __future__ import annotations

import tempfile
import time
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

from .google_store import GoogleStore, MD_MIME, PDF_MIME
from .http import HttpClient
from .models import Document, Issue
from .naming import base_filename, stable_document_id
from .ocr import pdf_to_markdown


SHEET_WRITE_DELAY_SECONDS = 90
FALLBACK_LOOKBACK_DAYS = 4


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
        ocr_dpi: int = 300,
        ocr_workers: int = 4,
    ) -> None:
        self.client = client
        self.store = store
        self.sources = sources
        self.ocr_dpi = max(250, ocr_dpi)
        self.ocr_workers = ocr_workers

    def run(self, start: date, end: date) -> Summary:
        self.store.initialize()
        summary = Summary()

        for source in self.sources:
            source_key = getattr(source, "key", "source")
            try:
                issues = source.discover(start, end)

                # Si en la ventana diaria (ayer + hoy) no hubo publicación,
                # buscar hasta 4 días hacia atrás y usar SOLO la fecha más
                # reciente que sí tenga ejemplares.
                if not issues:
                    fallback_start = end - timedelta(days=FALLBACK_LOOKBACK_DAYS - 1)
                    fallback_issues = source.discover(fallback_start, end)
                    if fallback_issues:
                        latest_date = max(issue.publication_date for issue in fallback_issues)
                        issues = [
                            issue
                            for issue in fallback_issues
                            if issue.publication_date == latest_date
                        ]
                        print(
                            f"FALLBACK {source_key}: sin publicaciones entre "
                            f"{start} y {end}; usando la última disponible: {latest_date}"
                        )
                    else:
                        print(
                            f"SIN PUBLICACIONES {source_key}: tampoco se encontró "
                            f"nada en los últimos {FALLBACK_LOOKBACK_DAYS} días"
                        )
            except Exception as exc:
                summary.failed += 1
                summary.errors.append(f"{source_key}: {type(exc).__name__}: {exc}")
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

    @staticmethod
    def _existing_is_complete(existing: object | None) -> bool:
        if not existing:
            return False
        return (
            existing.get("OCR Estado").strip().upper() == "COMPLETADO"
            and bool(existing.get("PDF File ID").strip())
            and bool(existing.get("MD File ID").strip())
        )

    def _process_document(self, issue: Issue, document: Document) -> str:
        document_id = stable_document_id(issue, document)
        existing = self.store.find(document_id)
        base = base_filename(issue, document)

        with tempfile.TemporaryDirectory(prefix="diario_") as tmp:
            tmpdir = Path(tmp)
            pdf_path = tmpdir / f"{base}.pdf"
            md_path = tmpdir / f"{base}.md"

            download = self.client.download_pdf(document.url, pdf_path)
            same_hash = bool(existing and existing.get("SHA256") == download.sha256)

            # Un SHA igual SOLO se considera terminado si también existe un OCR
            # completo y ambos archivos están registrados en Drive.
            if same_hash and self._existing_is_complete(existing):
                print(f"UNCHANGED {document_id} {download.sha256[:12]} OCR=COMPLETADO")
                self.store.mark_verified_unchanged(document_id)
                return "unchanged"

            if same_hash and existing:
                print(
                    f"REPROCESS {document_id}: SHA sin cambios pero OCR/Drive incompleto; "
                    "se regenerará el Markdown desde imágenes"
                )

            print(
                f"OCR VISUAL {document_id}: PDF -> PNG por página -> Tesseract "
                f"({self.ocr_dpi} DPI)"
            )
            ocr_result = pdf_to_markdown(
                pdf_path,
                md_path,
                dpi=self.ocr_dpi,
                max_workers=self.ocr_workers,
            )
            print(
                f"OCR OK {document_id}: páginas PDF={ocr_result.page_count}, "
                f"páginas OCR={ocr_result.pages_ocr}, "
                f"reintentos={list(ocr_result.retried_pages)}"
            )

            if ocr_result.pages_ocr != ocr_result.page_count:
                raise RuntimeError(
                    f"Cobertura OCR incompleta: PDF={ocr_result.page_count}, "
                    f"OCR={ocr_result.pages_ocr}"
                )

            folder_id = self.store.document_folder(
                source=issue.source,
                year=issue.publication_date.year,
                month=issue.publication_date.month,
            )

            if existing:
                pdf_file_id = existing.get("PDF File ID").strip()
                md_file_id = existing.get("MD File ID").strip()

                if pdf_file_id:
                    pdf_response = self.store.update_file(
                        pdf_file_id, pdf_path, mime_type=PDF_MIME
                    )
                else:
                    pdf_response = self.store.create_file(
                        pdf_path, parent_id=folder_id, mime_type=PDF_MIME
                    )
                pdf_file_id = pdf_response["id"]

                if md_file_id:
                    md_response = self.store.update_file(
                        md_file_id, md_path, mime_type=MD_MIME
                    )
                else:
                    md_response = self.store.create_file(
                        md_path, parent_id=folder_id, mime_type=MD_MIME
                    )
                md_file_id = md_response["id"]

                revision = int(existing.get("Revisión") or "1") + 1
                change = "REPROCESADO" if same_hash else "ACTUALIZADO"
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
            print(
                f"{change} {document_id} -> Drive / Sheet; "
                f"OCR visual completo {ocr_result.pages_ocr}/{ocr_result.page_count} páginas; "
                f"esperando {SHEET_WRITE_DELAY_SECONDS}s antes de permitir otra escritura"
            )
            time.sleep(SHEET_WRITE_DELAY_SECONDS)
            return state
