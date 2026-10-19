from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pymupdf

from diario_monitor.ocr import pdf_to_markdown


class OcrVisualTests(unittest.TestCase):
    def test_pdf_is_rasterized_page_by_page_before_markdown(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pdf_path = root / "ejemplo.pdf"
            md_path = root / "ejemplo.md"

            document = pymupdf.open()
            for number in (1, 2):
                page = document.new_page()
                page.insert_text(
                    (72, 72),
                    f"Contenido visual de prueba pagina {number}",
                    fontsize=12,
                )
            document.save(str(pdf_path))
            document.close()

            fake_ocr = (
                "Texto OCR obtenido desde la imagen renderizada de la pagina. "
                "Este contenido es deliberadamente largo para superar la "
                "validacion minima de calidad del OCR visual. "
            ) * 3

            with patch(
                "diario_monitor.ocr.pytesseract.image_to_string",
                return_value=fake_ocr,
            ) as mocked:
                result = pdf_to_markdown(
                    pdf_path,
                    md_path,
                    dpi=300,
                    max_workers=1,
                )

            self.assertEqual(result.page_count, 2)
            self.assertEqual(result.pages_ocr, 2)
            self.assertEqual(mocked.call_count, 2)

            markdown = md_path.read_text(encoding="utf-8")
            self.assertIn("## Página 1", markdown)
            self.assertIn("## Página 2", markdown)
            self.assertIn("Páginas PDF: 2", markdown)
            self.assertIn("Páginas OCR: 2", markdown)
            self.assertIn("convertida a imagen PNG", markdown)


if __name__ == "__main__":
    unittest.main()
