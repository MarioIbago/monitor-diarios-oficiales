from __future__ import annotations

import os
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

import pymupdf
import pytesseract
from PIL import Image, ImageOps


# OCR visual forzado:
# 1) cada página del PDF se rasteriza a un PNG físico;
# 2) Tesseract lee ese PNG, no la capa de texto del PDF;
# 3) páginas sospechosas se vuelven a renderizar a mayor DPI y se reintentan.


@dataclass(frozen=True, slots=True)
class OcrResult:
    page_count: int
    pages_ocr: int
    retried_pages: tuple[int, ...]
    suspicious_pages: tuple[int, ...]


@dataclass(frozen=True, slots=True)
class _PageResult:
    page_number: int
    text: str
    retried: bool
    suspicious: bool
    ink_ratio: float


def _render_page(pdf_path: str, page_index: int, dpi: int, output_path: Path) -> None:
    document = pymupdf.open(pdf_path)
    try:
        page = document.load_page(page_index)
        zoom = dpi / 72.0
        pixmap = page.get_pixmap(
            matrix=pymupdf.Matrix(zoom, zoom),
            alpha=False,
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)
        pixmap.save(str(output_path))
    finally:
        document.close()


def _prepare_image(image: Image.Image) -> Image.Image:
    # El autocontraste ayuda con escaneos grises sin destruir letras pequeñas.
    return ImageOps.autocontrast(ImageOps.grayscale(image))


def _ink_ratio(image: Image.Image) -> float:
    gray = _prepare_image(image)
    preview = gray.copy()
    preview.thumbnail((900, 900))
    histogram = preview.histogram()
    total = sum(histogram) or 1
    # Proporción aproximada de píxeles que no son casi blancos.
    return sum(histogram[:245]) / total


def _ocr_image(path: Path, language: str, *, psm: int = 3) -> tuple[str, float]:
    with Image.open(path) as original:
        ink = _ink_ratio(original)
        prepared = _prepare_image(original)
        text = pytesseract.image_to_string(
            prepared,
            lang=language,
            config=f"--oem 1 --psm {psm}",
        ).strip()
    return text, ink


def _ocr_split_columns(path: Path, language: str) -> str:
    """Fallback para páginas con columnas o letra muy pequeña.

    Divide la imagen en dos mitades verticales SIN solape para evitar texto
    duplicado. Se usa solo cuando el OCR de página completa parece insuficiente.
    """
    with Image.open(path) as original:
        prepared = _prepare_image(original)
        width, height = prepared.size
        midpoint = width // 2
        crops = (
            prepared.crop((0, 0, midpoint, height)),
            prepared.crop((midpoint, 0, width, height)),
        )
        parts = [
            pytesseract.image_to_string(
                crop,
                lang=language,
                config="--oem 1 --psm 6",
            ).strip()
            for crop in crops
        ]
    return "\n\n".join(part for part in parts if part).strip()


def _meaningful_chars(text: str) -> int:
    return sum(1 for char in text if char.isalnum())


def _needs_retry(text: str, ink: float) -> bool:
    # Una página casi vacía puede ser legítima. Solo reintentamos cuando la
    # imagen tiene suficiente contenido visual y el OCR produjo muy poco texto.
    return ink >= 0.018 and _meaningful_chars(text) < 120


def _still_suspicious(text: str, ink: float) -> bool:
    # Umbral conservador para no marcar COMPLETADO cuando parece haberse leído
    # únicamente un encabezado/pie de página.
    return ink >= 0.03 and _meaningful_chars(text) < 45


def _ocr_page(
    pdf_path: str,
    page_index: int,
    dpi: int,
    retry_dpi: int,
    language: str,
    images_dir: str,
) -> _PageResult:
    page_number = page_index + 1
    images = Path(images_dir)

    primary_png = images / f"pagina_{page_number:04d}_{dpi}dpi.png"
    _render_page(pdf_path, page_index, dpi, primary_png)
    text, ink = _ocr_image(primary_png, language, psm=3)

    retried = False
    if _needs_retry(text, ink):
        retried = True
        retry_png = images / f"pagina_{page_number:04d}_{retry_dpi}dpi_retry.png"
        _render_page(pdf_path, page_index, retry_dpi, retry_png)

        retry_text, retry_ink = _ocr_image(retry_png, language, psm=3)
        split_text = _ocr_split_columns(retry_png, language)

        candidates = [text, retry_text, split_text]
        text = max(candidates, key=_meaningful_chars)
        ink = max(ink, retry_ink)

    return _PageResult(
        page_number=page_number,
        text=text.strip(),
        retried=retried,
        suspicious=_still_suspicious(text, ink),
        ink_ratio=ink,
    )


def pdf_to_markdown(
    pdf_path: Path,
    markdown_path: Path,
    *,
    dpi: int = 300,
    language: str = "spa",
    max_workers: int | None = None,
) -> OcrResult:
    """Convierte PDF -> PNG por página -> OCR visual -> Markdown.

    La capa de texto del PDF NO se usa para construir el Markdown.
    Todas las páginas deben pasar por rasterización y OCR.
    """
    pdf_path = pdf_path.resolve()
    markdown_path = markdown_path.resolve()
    markdown_path.parent.mkdir(parents=True, exist_ok=True)

    with pymupdf.open(str(pdf_path)) as document:
        page_count = len(document)

    if page_count == 0:
        raise ValueError(f"El PDF no tiene páginas: {pdf_path}")

    dpi = max(250, int(dpi))
    retry_dpi = max(350, dpi + 50)
    workers = max_workers or min(4, max(1, os.cpu_count() or 1))
    workers = max(1, workers)

    results: list[_PageResult | None] = [None] * page_count

    # Los PNG son deliberadamente archivos físicos temporales. Esto garantiza
    # que el OCR se ejecute sobre la imagen renderizada de cada página.
    with tempfile.TemporaryDirectory(prefix="paginas_ocr_") as images_dir:
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(
                    _ocr_page,
                    str(pdf_path),
                    index,
                    dpi,
                    retry_dpi,
                    language,
                    images_dir,
                ): index
                for index in range(page_count)
            }
            for future in as_completed(futures):
                index = futures[future]
                results[index] = future.result()

    if any(result is None for result in results):
        missing = [index + 1 for index, result in enumerate(results) if result is None]
        raise RuntimeError(f"Faltaron páginas por procesar: {missing}")

    pages = [result for result in results if result is not None]
    suspicious = [result.page_number for result in pages if result.suspicious]
    retried = [result.page_number for result in pages if result.retried]

    # No subir ni marcar COMPLETADO un Markdown sospechosamente incompleto.
    if suspicious:
        raise RuntimeError(
            "OCR visual incompleto. Páginas con contenido visual pero texto OCR "
            f"insuficiente después del reintento: {suspicious}"
        )

    chunks: list[str] = [
        "# OCR visual del ejemplar",
        "",
        "> Método: cada página del PDF fue convertida a imagen PNG y el OCR se "
        "ejecutó sobre esas imágenes; la capa de texto del PDF no se usó como "
        "fuente principal.",
        "",
        f"- Páginas PDF: {page_count}",
        f"- Páginas OCR: {len(pages)}",
        f"- DPI principal: {dpi}",
        f"- Páginas reintentadas a {retry_dpi} DPI: "
        + (", ".join(map(str, retried)) if retried else "ninguna"),
        "",
    ]

    for result in pages:
        text = result.text or "_Página sin texto legible detectado por OCR visual._"
        chunks.extend(
            [
                f"## Página {result.page_number}",
                "",
                text,
                "",
            ]
        )

    markdown_path.write_text("\n".join(chunks).rstrip() + "\n", encoding="utf-8")

    # Validación final de cobertura: un encabezado por cada página del PDF.
    rendered = markdown_path.read_text(encoding="utf-8")
    page_headers = sum(
        1 for line in rendered.splitlines() if line.startswith("## Página ")
    )
    if page_headers != page_count:
        raise RuntimeError(
            f"Validación falló: PDF={page_count} páginas, Markdown={page_headers} bloques"
        )

    return OcrResult(
        page_count=page_count,
        pages_ocr=len(pages),
        retried_pages=tuple(retried),
        suspicious_pages=tuple(),
    )
