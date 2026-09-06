from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path

import fitz
import pytesseract
from PIL import Image


# Importante: este OCR NO confía en la capa de texto del PDF.
# Cada página completa se rasteriza y se manda a Tesseract.


def _ocr_page(pdf_path: str, page_number: int, dpi: int, language: str) -> tuple[int, str]:
    document = fitz.open(pdf_path)
    try:
        page = document.load_page(page_number)
        zoom = dpi / 72.0
        pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        image = Image.open(BytesIO(pixmap.tobytes("png")))
        text = pytesseract.image_to_string(
            image,
            lang=language,
            config="--oem 1 --psm 3",
        ).strip()
        return page_number, text
    finally:
        document.close()


def pdf_to_markdown(
    pdf_path: Path,
    markdown_path: Path,
    *,
    dpi: int = 150,
    language: str = "spa",
    max_workers: int | None = None,
) -> int:
    """OCR forzado de TODAS las páginas del PDF y escritura a Markdown.

    Devuelve el número de páginas procesadas.
    """
    pdf_path = pdf_path.resolve()
    markdown_path = markdown_path.resolve()
    markdown_path.parent.mkdir(parents=True, exist_ok=True)

    with fitz.open(str(pdf_path)) as document:
        page_count = len(document)

    if page_count == 0:
        raise ValueError(f"El PDF no tiene páginas: {pdf_path}")

    workers = max_workers or min(4, max(1, os.cpu_count() or 1))
    workers = max(1, workers)

    results: list[str | None] = [None] * page_count
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(_ocr_page, str(pdf_path), index, dpi, language): index
            for index in range(page_count)
        }
        for future in as_completed(futures):
            index, text = future.result()
            results[index] = text

    chunks: list[str] = []
    for index, text in enumerate(results, start=1):
        chunks.append(f"<!-- PAGINA {index} -->\n\n{(text or '').strip()}\n")

    markdown_path.write_text("\n\n".join(chunks), encoding="utf-8")
    return page_count
