from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from googleapiclient.errors import HttpError, ResumableUploadError

from diario_monitor.google_store import GoogleStore, PDF_MIME


class GoogleStoreUploadRetryTests(unittest.TestCase):
    def _store(self) -> GoogleStore:
        store = GoogleStore.__new__(GoogleStore)
        store.drive = MagicMock()
        return store

    @staticmethod
    def _http_error(status: int) -> HttpError:
        return HttpError(resp=SimpleNamespace(status=status, reason="error"), content=b"{}")

    @staticmethod
    def _resumable_error(status: int) -> ResumableUploadError:
        return ResumableUploadError(
            resp=SimpleNamespace(status=status, reason="error"),
            content=b"{}",
        )

    def test_create_file_retries_transient_resumable_upload_error(self) -> None:
        store = self._store()
        request = MagicMock()
        request.execute.side_effect = [self._resumable_error(500), {"id": "pdf-1"}]
        store.drive.files.return_value.create.return_value = request

        with tempfile.TemporaryDirectory() as tmp:
            pdf = Path(tmp) / "archivo.pdf"
            pdf.write_bytes(b"%PDF-1.4")
            with patch("diario_monitor.google_store.time.sleep") as sleep:
                result = store.create_file(pdf, parent_id="folder-1", mime_type=PDF_MIME)

        self.assertEqual(result["id"], "pdf-1")
        self.assertEqual(request.execute.call_count, 2)
        sleep.assert_called_once()

    def test_update_file_retries_transient_http_error(self) -> None:
        store = self._store()
        request = MagicMock()
        request.execute.side_effect = [self._http_error(500), {"id": "pdf-1"}]
        store.drive.files.return_value.update.return_value = request

        with tempfile.TemporaryDirectory() as tmp:
            pdf = Path(tmp) / "archivo.pdf"
            pdf.write_bytes(b"%PDF-1.4")
            with patch("diario_monitor.google_store.time.sleep") as sleep:
                result = store.update_file("pdf-1", pdf, mime_type=PDF_MIME)

        self.assertEqual(result["id"], "pdf-1")
        self.assertEqual(request.execute.call_count, 2)
        sleep.assert_called_once()

    def test_create_file_does_not_retry_non_transient_error(self) -> None:
        store = self._store()
        request = MagicMock()
        request.execute.side_effect = self._http_error(400)
        store.drive.files.return_value.create.return_value = request

        with tempfile.TemporaryDirectory() as tmp:
            pdf = Path(tmp) / "archivo.pdf"
            pdf.write_bytes(b"%PDF-1.4")
            with patch("diario_monitor.google_store.time.sleep") as sleep:
                with self.assertRaises(HttpError):
                    store.create_file(pdf, parent_id="folder-1", mime_type=PDF_MIME)

        self.assertEqual(request.execute.call_count, 1)
        sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
