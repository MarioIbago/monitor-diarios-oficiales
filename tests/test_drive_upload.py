from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from googleapiclient.errors import HttpError, ResumableUploadError

from diario_monitor.google_store import GoogleStore


class _FakeRequest:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = 0

    def next_chunk(self, num_retries: int = 0):
        self.calls += 1
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


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


def _http_error(status: int) -> HttpError:
    return HttpError(
        resp=SimpleNamespace(status=status, reason="error"),
        content=b"{}",
    )


def _resumable_error(status: int) -> ResumableUploadError:
    return ResumableUploadError(
        resp=SimpleNamespace(status=status, reason="error"),
        content=b"{}",
    )


class DriveUploadRetryTests(unittest.TestCase):
    def _store(self) -> GoogleStore:
        store = object.__new__(GoogleStore)
        store.drive = _FakeDrive()
        return store

    def test_resumable_upload_retries_transient_500_and_verifies_file(self) -> None:
        request = _FakeRequest(
            [
                _resumable_error(500),
                _resumable_error(503),
                (None, {"id": "file-123", "name": "ejemplo.pdf"}),
            ]
        )

        with patch("diario_monitor.google_store.time.sleep"), patch(
            "diario_monitor.google_store.random.random", return_value=0.0
        ):
            result = self._store()._execute_resumable_upload(
                request,
                label="ejemplo.pdf",
            )

        self.assertEqual(request.calls, 3)
        self.assertEqual(result["id"], "file-123")
        self.assertEqual(result["name"], "ejemplo.pdf")

    def test_resumable_upload_retries_transient_http_429(self) -> None:
        request = _FakeRequest(
            [
                _http_error(429),
                (None, {"id": "file-123", "name": "ejemplo.pdf"}),
            ]
        )

        with patch("diario_monitor.google_store.time.sleep"), patch(
            "diario_monitor.google_store.random.random", return_value=0.0
        ):
            result = self._store()._execute_resumable_upload(
                request,
                label="ejemplo.pdf",
            )

        self.assertEqual(request.calls, 2)
        self.assertEqual(result["id"], "file-123")

    def test_resumable_upload_does_not_retry_non_transient_400(self) -> None:
        request = _FakeRequest([_http_error(400)])

        with patch("diario_monitor.google_store.time.sleep") as sleep:
            with self.assertRaises(HttpError):
                self._store()._execute_resumable_upload(
                    request,
                    label="ejemplo.pdf",
                )

        self.assertEqual(request.calls, 1)
        sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
