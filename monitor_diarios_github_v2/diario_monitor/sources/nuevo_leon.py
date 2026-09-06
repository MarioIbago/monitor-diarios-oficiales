from __future__ import annotations

import re
from datetime import date, timedelta
from pathlib import PurePosixPath
from urllib.parse import urljoin, urlsplit, urlunsplit

from lxml import html

from ..http import HttpClient
from ..models import Document, Issue


NL_LISTING_URL = (
    "https://sistec.nl.gob.mx/Transparencia_2015_LYPOE/Acciones/PeriodicoOficial.aspx"
)
_MONTHS = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "setiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
}
_SPANISH_DATE = re.compile(
    r"^(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})$", re.IGNORECASE
)
_PART_NUMBER = re.compile(r"parte\s*(\d+)", re.IGNORECASE)
_FILE_PART_NUMBER = re.compile(r"_(\d{6})\.pdf$", re.IGNORECASE)


def _clean_text(value: str) -> str:
    return " ".join(value.replace("\xa0", " ").split())


def _allowed_nl_url(url: str) -> str:
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    if host not in {"sistec.nl.gob.mx", "sgi.nl.gob.mx"}:
        raise ValueError(f"Nuevo Leon devolvio un enlace fuera de su dominio: {url}")
    if parts.scheme == "http":
        parts = parts._replace(scheme="https")
        url = urlunsplit(parts)
    return url


def _parse_spanish_date(value: str) -> date:
    match = _SPANISH_DATE.match(_clean_text(value).casefold())
    if not match:
        raise ValueError(f"Fecha no reconocida en el portal de Nuevo Leon: {value!r}")
    month = _MONTHS.get(match.group(2))
    if month is None:
        raise ValueError(f"Mes no reconocido: {match.group(2)!r}")
    return date(int(match.group(3)), month, int(match.group(1)))


def _safe_component(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
    return cleaned.strip("._-") or "sin_numero"


def parse_nuevo_leon_listing(body: bytes, page_url: str) -> list[Issue]:
    document = html.fromstring(body, base_url=page_url)
    if not document.xpath('//table[@id="dgData"]'):
        raise ValueError("No se encontro la tabla de publicaciones de Nuevo Leon")
    issues: list[Issue] = []

    for row in document.xpath('//table[@id="dgData"]//tr'):
        cells = row.xpath("./td")
        if len(cells) < 3:
            continue
        issue_number = _clean_text(cells[0].text_content())
        raw_date = _clean_text(cells[1].text_content())
        if not issue_number or not raw_date:
            continue
        try:
            publication_date = _parse_spanish_date(raw_date)
        except ValueError:
            continue

        issue_id = f"nuevo_leon:{publication_date.isoformat()}:{issue_number}"
        documents: list[Document] = []
        seen_urls: set[str] = set()
        pdf_anchors = cells[2].xpath('.//a[contains(translate(@href, "PDF", "pdf"), ".pdf")]')
        for fallback_part, anchor in enumerate(pdf_anchors, start=1):
            raw_url = urljoin(page_url, anchor.get("href", ""))
            secure_url = _allowed_nl_url(raw_url)
            if secure_url in seen_urls:
                continue
            seen_urls.add(secure_url)

            title = anchor.get("title") or ""
            part_match = _PART_NUMBER.search(title)
            filename = PurePosixPath(urlsplit(secure_url).path).name
            file_match = _FILE_PART_NUMBER.search(filename)
            if part_match:
                part_number = int(part_match.group(1))
            elif file_match:
                part_number = int(file_match.group(1))
            else:
                part_number = fallback_part

            relative_path = str(
                PurePosixPath(
                    "pdfs",
                    "nuevo_leon",
                    f"{publication_date.year:04d}",
                    f"{publication_date.month:02d}",
                    f"{publication_date.day:02d}",
                    f"numero_{_safe_component(issue_number)}",
                    f"parte_{part_number:02d}.pdf",
                )
            )
            documents.append(
                Document(
                    id=f"{issue_id}:{filename.casefold()}",
                    issue_id=issue_id,
                    url=secure_url,
                    original_url=raw_url,
                    relative_path=relative_path,
                    label=f"Parte {part_number:02d}",
                    part_number=part_number,
                )
            )

        if not documents:
            continue
        documents.sort(key=lambda item: (item.part_number or 0, item.url))
        issues.append(
            Issue(
                id=issue_id,
                source="nuevo_leon",
                publication_date=publication_date,
                source_page_url=page_url,
                issue_number=issue_number,
                documents=tuple(documents),
                metadata={
                    "parts_count": len(documents),
                    "raw_date": raw_date,
                },
            )
        )

    issues.sort(key=lambda item: (item.publication_date, item.issue_number or ""))
    return issues


def _hidden_form_fields(body: bytes) -> dict[str, str]:
    document = html.fromstring(body)
    fields: dict[str, str] = {}
    for element in document.xpath('//form[@id="frmPeriodicoOficial"]//input[@name]'):
        name = element.get("name")
        if name:
            fields[name] = element.get("value", "")
    required = {"__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"}
    missing = sorted(required - fields.keys())
    if missing:
        raise ValueError(f"Faltan campos WebForms en Nuevo Leon: {', '.join(missing)}")
    return fields


class NuevoLeonSource:
    key = "nuevo_leon"
    display_name = "Periodico Oficial del Estado de Nuevo Leon"
    max_query_days = 31

    def __init__(self, client: HttpClient) -> None:
        self.client = client

    def discover(self, start: date, end: date) -> list[Issue]:
        by_id: dict[str, Issue] = {}
        chunk_start = start
        while chunk_start <= end:
            chunk_end = min(end, chunk_start + timedelta(days=self.max_query_days - 1))
            for issue in self._query(chunk_start, chunk_end):
                if start <= issue.publication_date <= end:
                    by_id[issue.id] = issue
            chunk_start = chunk_end + timedelta(days=1)
        return sorted(
            by_id.values(),
            key=lambda item: (item.publication_date, item.issue_number or ""),
        )

    def _query(self, start: date, end: date) -> list[Issue]:
        landing = self.client.get(NL_LISTING_URL)
        fields = _hidden_form_fields(landing.body)
        fields.update(
            {
                "__EVENTTARGET": "btnBuscar",
                "__EVENTARGUMENT": "",
                "ddlIndicesAnuales": "0",
                "txtFhInicio": start.strftime("%d/%m/%Y"),
                "txtFhFin": end.strftime("%d/%m/%Y"),
            }
        )
        result = self.client.post_form(NL_LISTING_URL, fields)
        return parse_nuevo_leon_listing(result.body, result.url)


__all__ = [
    "NL_LISTING_URL",
    "NuevoLeonSource",
    "parse_nuevo_leon_listing",
]
