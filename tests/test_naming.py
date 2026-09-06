from datetime import date
import unittest

from diario_monitor.models import Document, Issue
from diario_monitor.naming import base_filename, stable_document_id


class NamingTests(unittest.TestCase):
    def test_dof(self):
        issue = Issue(
            id="dof:2026-09-05:MAT",
            source="dof",
            publication_date=date(2026, 9, 5),
            source_page_url="https://dof.gob.mx/",
            edition="MAT",
        )
        doc = Document("x", issue.id, "https://x/a.pdf", "https://x", "x.pdf", "Ejemplar")
        self.assertEqual(base_filename(issue, doc), "DOF_2026-09-05_MAT")
        self.assertEqual(stable_document_id(issue, doc), "dof:2026-09-05:MAT:completo")

    def test_nl(self):
        issue = Issue(
            id="nuevo_leon:2026-09-05:123",
            source="nuevo_leon",
            publication_date=date(2026, 9, 5),
            source_page_url="https://nl.gob.mx/",
            issue_number="123",
        )
        doc = Document("x", issue.id, "https://x/a.pdf", "https://x", "x.pdf", "Parte", part_number=2)
        self.assertEqual(base_filename(issue, doc), "PONL_2026-09-05_Numero_123_Parte_02")
        self.assertEqual(stable_document_id(issue, doc), "nuevo_leon:2026-09-05:123:parte:02")


if __name__ == "__main__":
    unittest.main()
