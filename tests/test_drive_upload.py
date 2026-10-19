from __future__ import annotations

import unittest
from unittest.mock import patch

from diario_monitor.google_store import GoogleStore


class ResumableUploadError(Exception):
    pass


class _FakeRequest:
    def __init__(self) -> None:
        self.calls = 0

    def next_chunk(self, num_retries: int = 0):
        self.calls += 1
        if self.calls < 3:
            raise ResumableUploadError("temporary 500")
        return None, {"id": "file-123", "name": "ejemplo.pdf"}


class _FakeExecute:
    def execute(self, num_retries: int = 0):
        return {
            "id": "file-123",
            "name": "ejemplo.pdf",
            "webViewLink": "https://drive.google.com/file/d/file-123/view",
            "size": "12345",
        }


class _FakeFiles:
    def get(self, **kwargs):
        return _FakeExecute()


class _FakeDrive:
    def files(self):
        return _FakeFiles()


class DriveUploadRetryTests(unittest.TestCase):
    def test_resumable_upload_retries_transient_failure_and_verifies_file(self) -> None:
        store = object.__new__(GoogleStore)
        store.drive = _FakeDrive()
        request = _FakeRequest()

        with patch("diario_monitor.google_store.time.sleep"), patch(
            "diario_monitor.google_store.random.random", return_value=0.0
        ):
            result = store._execute_resumable_upload(request, label="ejemplo.pdf")

        self.assertEqual(request.calls, 3)
        self.assertEqual(result["id"], "file-123")
        self.assertEqual(result["name"], "ejemplo.pdf")


if __name__ == "__main__":
    unittest.main()
