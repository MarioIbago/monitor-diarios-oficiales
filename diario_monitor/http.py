from __future__ import annotations

import hashlib
import os
import random
import socket
import time
from dataclasses import dataclass
from email.message import Message
from http.client import IncompleteRead
from http.cookiejar import CookieJar
from pathlib import Path
from typing import Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPCookieProcessor, Request, build_opener


DEFAULT_USER_AGENT = (
    "MonitorDiariosOficiales/0.1 "
    "(uso interno; frecuencia baja; documentos publicos oficiales)"
)


class HttpClientError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class HttpResponse:
    url: str
    status: int
    headers: Mapping[str, str]
    body: bytes


@dataclass(frozen=True, slots=True)
class DownloadResult:
    url: str
    sha256: str
    size_bytes: int
    content_type: str
    etag: str | None
    last_modified: str | None


class HttpClient:
    """Cliente HTTP con cookies, pausa por host y reintentos conservadores."""

    def __init__(
        self,
        *,
        timeout: float = 60.0,
        retries: int = 4,
        min_delay: float = 0.75,
        user_agent: str = DEFAULT_USER_AGENT,
    ) -> None:
        self.timeout = timeout
        self.retries = max(1, retries)
        self.min_delay = max(0.0, min_delay)
        self.user_agent = user_agent
        self._opener = build_opener(HTTPCookieProcessor(CookieJar()))
        self._last_request_by_host: dict[str, float] = {}

    def get(self, url: str, *, headers: Mapping[str, str] | None = None) -> HttpResponse:
        return self._request(url, headers=headers)

    def post_form(
        self,
        url: str,
        fields: Mapping[str, str],
        *,
        headers: Mapping[str, str] | None = None,
    ) -> HttpResponse:
        body = urlencode(fields).encode("utf-8")
        merged = {"Content-Type": "application/x-www-form-urlencoded"}
        if headers:
            merged.update(headers)
        return self._request(url, method="POST", data=body, headers=merged)

    def download_pdf(self, url: str, destination: Path) -> DownloadResult:
        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_path = destination.with_name(
            f".{destination.name}.{os.getpid()}.{random.randrange(1_000_000):06d}.part"
        )

        last_error: BaseException | None = None
        for attempt in range(self.retries):
            temp_path.unlink(missing_ok=True)
            request = self._build_request(url)
            try:
                self._pace(url)
                with self._opener.open(request, timeout=self.timeout) as response:
                    status = int(getattr(response, "status", 200))
                    if status >= 400:
                        raise HttpClientError(f"HTTP {status} al descargar {url}")

                    headers = self._headers_to_dict(response.headers)
                    expected_length = self._parse_content_length(headers.get("content-length"))
                    content_type = headers.get("content-type", "").split(";", 1)[0].strip().lower()
                    digest = hashlib.sha256()
                    size = 0
                    prefix = b""

                    with temp_path.open("wb") as output:
                        while True:
                            chunk = response.read(1024 * 1024)
                            if not chunk:
                                break
                            if len(prefix) < 8:
                                prefix += chunk[: 8 - len(prefix)]
                            output.write(chunk)
                            digest.update(chunk)
                            size += len(chunk)
                        output.flush()
                        os.fsync(output.fileno())

                    if not prefix.startswith(b"%PDF-"):
                        raise HttpClientError(
                            f"La respuesta no es un PDF valido ({content_type or 'sin Content-Type'}): {url}"
                        )
                    if expected_length is not None and size != expected_length:
                        raise HttpClientError(
                            f"PDF incompleto: se esperaban {expected_length} bytes y llegaron {size}"
                        )

                    temp_path.replace(destination)
                    return DownloadResult(
                        url=response.geturl(),
                        sha256=digest.hexdigest(),
                        size_bytes=size,
                        content_type=content_type or "application/pdf",
                        etag=headers.get("etag"),
                        last_modified=headers.get("last-modified"),
                    )
            except (HTTPError, URLError, TimeoutError, socket.timeout, IncompleteRead, OSError, HttpClientError) as exc:
                last_error = exc
                temp_path.unlink(missing_ok=True)
                if not self._should_retry(exc, attempt):
                    break
                self._sleep_before_retry(attempt, exc)

        raise HttpClientError(f"No se pudo descargar {url}: {last_error}") from last_error

    def _request(
        self,
        url: str,
        *,
        method: str = "GET",
        data: bytes | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> HttpResponse:
        last_error: BaseException | None = None
        for attempt in range(self.retries):
            request = self._build_request(url, method=method, data=data, headers=headers)
            try:
                self._pace(url)
                with self._opener.open(request, timeout=self.timeout) as response:
                    body = response.read()
                    return HttpResponse(
                        url=response.geturl(),
                        status=int(getattr(response, "status", 200)),
                        headers=self._headers_to_dict(response.headers),
                        body=body,
                    )
            except (HTTPError, URLError, TimeoutError, socket.timeout, IncompleteRead, OSError) as exc:
                last_error = exc
                if not self._should_retry(exc, attempt):
                    break
                self._sleep_before_retry(attempt, exc)
        raise HttpClientError(f"No se pudo consultar {url}: {last_error}") from last_error

    def _build_request(
        self,
        url: str,
        *,
        method: str = "GET",
        data: bytes | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> Request:
        merged = {
            "User-Agent": self.user_agent,
            "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
            "Accept-Language": "es-MX,es;q=0.9",
            "Connection": "close",
        }
        if headers:
            merged.update(headers)
        return Request(url, data=data, headers=merged, method=method)

    def _pace(self, url: str) -> None:
        host = (urlsplit(url).hostname or "").lower()
        now = time.monotonic()
        previous = self._last_request_by_host.get(host)
        if previous is not None:
            remaining = self.min_delay - (now - previous)
            if remaining > 0:
                time.sleep(remaining)
        self._last_request_by_host[host] = time.monotonic()

    def _should_retry(self, exc: BaseException, attempt: int) -> bool:
        if attempt >= self.retries - 1:
            return False
        if isinstance(exc, HTTPError):
            return exc.code in {408, 425, 429, 500, 502, 503, 504}
        return True

    @staticmethod
    def _headers_to_dict(headers: Message) -> dict[str, str]:
        return {key.lower(): value for key, value in headers.items()}

    @staticmethod
    def _parse_content_length(value: str | None) -> int | None:
        if not value:
            return None
        try:
            return int(value)
        except ValueError:
            return None

    @staticmethod
    def _sleep_before_retry(attempt: int, exc: BaseException) -> None:
        retry_after: float | None = None
        if isinstance(exc, HTTPError):
            raw = exc.headers.get("Retry-After")
            if raw:
                try:
                    retry_after = float(raw)
                except ValueError:
                    retry_after = None
        delay = retry_after if retry_after is not None else min(12.0, 1.25 * (2**attempt))
        time.sleep(delay + random.random() * 0.25)
