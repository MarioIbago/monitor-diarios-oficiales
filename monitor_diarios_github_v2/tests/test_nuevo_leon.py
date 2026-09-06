from __future__ import annotations

import unittest
from datetime import date

from diario_monitor.sources.nuevo_leon import parse_nuevo_leon_listing


NL_HTML = b"""
<!doctype html><html><body>
<table id="dgData">
<tr><td>N&uacute;mero</td><td>Fecha</td><td>Contenido</td></tr>
<tr>
  <td>118</td><td>04 de septiembre de 2026</td><td>
    <table><tr><td>
      <a title="Descargar contenido parte 01" href="http://sistec.nl.gob.mx/Transparencia_2015/Archivos/AC_001_000001.pdf"></a>
      <a title="Descargar contenido parte 02" href="http://sistec.nl.gob.mx/Transparencia_2015/Archivos/AC_001_000002.pdf"></a>
    </td></tr></table>
  </td>
</tr>
</table>
</body></html>
"""


class NuevoLeonParserTests(unittest.TestCase):
    def test_parses_issue_parts_and_upgrades_https(self) -> None:
        issues = parse_nuevo_leon_listing(
            NL_HTML,
            "https://sistec.nl.gob.mx/Transparencia_2015_LYPOE/Acciones/PeriodicoOficial.aspx",
        )
        self.assertEqual(len(issues), 1)
        issue = issues[0]
        self.assertEqual(issue.publication_date, date(2026, 9, 4))
        self.assertEqual(issue.issue_number, "118")
        self.assertEqual(len(issue.documents), 2)
        self.assertEqual(issue.documents[0].part_number, 1)
        self.assertTrue(issue.documents[0].url.startswith("https://"))
        self.assertEqual(
            issue.documents[1].relative_path,
            "pdfs/nuevo_leon/2026/09/04/numero_118/parte_02.pdf",
        )


if __name__ == "__main__":
    unittest.main()

