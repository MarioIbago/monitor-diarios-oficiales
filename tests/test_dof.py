from __future__ import annotations

import unittest
from datetime import date

from diario_monitor.sources.dof import (
    parse_dof_issue_page,
    parse_dof_pdf_redirect,
)


DOF_HTML = b"""
<!doctype html><html><body><table><tbody>
<tr><td><a onclick="document.getElementById('descarg').src='/nota_to_pdf.php?fecha=04/09/2026&amp;edicion=MAT';">PDF</a></td></tr>
<tr><td>Fecha: 04/09/2026 - Edici&oacute;n Matutina</td></tr>
<tr><td class="txt_blanco"> UNICA SECCION </td></tr>
<tr><td class="txt_blanco2"> PODER EJECUTIVO </td></tr>
<tr><td class="subtitle_azul"> SECRETARIA DE ECONOMIA <a href="/nota_to_doc.php?codnota=1"></a></td></tr>
<tr><td><a href="/nota_detalle.php?codigo=5797943&amp;fecha=04/09/2026"> Resoluci&oacute;n de prueba. </a></td></tr>
<tr><td><a href="/nota_to_imagen_fs.php?codnota=5797943&amp;cod_diario=329465"></a></td></tr>
</tbody></table></body></html>
"""


class DofParserTests(unittest.TestCase):
    def test_parses_issue_hierarchy_and_pdf_resolver(self) -> None:
        parsed = parse_dof_issue_page(
            DOF_HTML,
            "https://dof.gob.mx/index.php?year=2026&month=09&day=04&edicion=MAT",
            expected_date=date(2026, 9, 4),
            expected_edition="MAT",
        )
        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed.publication_date, date(2026, 9, 4))
        self.assertEqual(parsed.edition, "MAT")
        self.assertEqual(
            parsed.resolver_url,
            "https://dof.gob.mx/nota_to_pdf.php?fecha=04/09/2026&edicion=MAT",
        )
        self.assertEqual(parsed.cod_diario, "329465")
        self.assertEqual(len(parsed.entries), 1)
        self.assertEqual(parsed.entries[0].external_id, "5797943")
        self.assertEqual(parsed.entries[0].section, "UNICA SECCION")
        self.assertEqual(parsed.entries[0].authority, "PODER EJECUTIVO")
        self.assertEqual(parsed.entries[0].agency, "SECRETARIA DE ECONOMIA")

    def test_page_without_issue_returns_none(self) -> None:
        parsed = parse_dof_issue_page(
            b"<html><head><title>DOF - Diario Oficial de la Federacion</title></head><body>Sin publicacion</body></html>",
            "https://dof.gob.mx/index.php",
            expected_date=date(2026, 9, 5),
            expected_edition="MAT",
        )
        self.assertIsNone(parsed)

    def test_official_no_data_message_returns_none_without_title(self) -> None:
        parsed = parse_dof_issue_page(
            b"<html><body>No hay datos para la fecha seleccionada</body></html>",
            "https://dof.gob.mx/index.php?year=2026&month=09&day=05&edicion=MAT",
            expected_date=date(2026, 9, 5),
            expected_edition="MAT",
        )
        self.assertIsNone(parsed)

    def test_accented_dof_title_is_accepted(self) -> None:
        parsed = parse_dof_issue_page(
            "<html><head><title>DOF - Diario Oficial de la Federación</title></head><body>Sin publicación</body></html>".encode("utf-8"),
            "https://dof.gob.mx/index.php",
            expected_date=date(2026, 9, 5),
            expected_edition="MAT",
        )
        self.assertIsNone(parsed)

    def test_unrelated_html_still_raises(self) -> None:
        with self.assertRaisesRegex(ValueError, "ya no parece ser una pagina del DOF"):
            parse_dof_issue_page(
                b"<html><head><title>Access denied</title></head><body>blocked</body></html>",
                "https://dof.gob.mx/index.php",
                expected_date=date(2026, 9, 5),
                expected_edition="MAT",
            )

    def test_parses_javascript_pdf_redirect(self) -> None:
        target = parse_dof_pdf_redirect(
            b"<script> self.location=('abrirPDF.php?archivo=04092026-MAT.pdf&anio=2026&repo='); </script>",
            "https://dof.gob.mx/nota_to_pdf.php?fecha=04/09/2026&edicion=MAT",
        )
        self.assertEqual(
            target,
            "https://dof.gob.mx/abrirPDF.php?archivo=04092026-MAT.pdf&anio=2026&repo=",
        )


if __name__ == "__main__":
    unittest.main()
