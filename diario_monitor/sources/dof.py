from __future__ import annotations

import hashlib
import html as html_stdlib
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import PurePosixPath
from urllib.parse import parse_qs, urljoin, urlsplit

from lxml import html

from ..http import HttpClient, HttpClientError
from ..models import Document, Entry, Issue


DOF_BASE_URL = "https://dof.gob.mx/"
DOF_INDEX_URL = urljoin(DOF_BASE_URL, "index.php")
EDITION_LABELS = {"MAT": "Matutina", "VES": "Vespertina"}
_ISSUE_MARKER = re.compile(
    r"Fecha:\s*(\d{2}/\d{2}/\d{4})\s*-\s*Edici[oó]n\s+(Matutina|Vespertina)",
    re.IGNORECASE,
)
_RESOLVER_PATH = re.compile(
    r"(?:\.src|location)\s*=\s*\(?\s*['\"]([^'\"]*(?:nota_to_pdf|abrirPDF)\.php[^'\"]*)['\"]",
    re.IGNORECASE,
)
_DIRECT_PDF_REDIRECT = re.compile(
    r"(?:self\.)?location\s*=\s*\(?\s*['\"]([^'\"]*abrirPDF\.php[^'\"]*)['\"]",
    re.IGNORECASE,
)


def _clean_text(value: str) -> str:
    return " ".join(value.replace("\xa0", " ").split())


def _decode_html(body: bytes) -> str:
    """Decodifica HTML del DOF sin depender de la heurística de lxml."""
    try:
        return body.decode("utf-8")
    except UnicodeDecodeError:
        return body.decode("cp1252", errors="replace")


def _fold_text(value: str) -> str:
    """Normaliza acentos/capitalización para comparar texto del portal."""
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(
        char for char in normalized if not unicodedata.combining(char)
    ).casefold()


def _iter_dates(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def _allowed_dof_url(url: str) -> str:
    host = (urlsplit(url).hostname or "").lower()
    if host not in {"dof.gob.mx", "www.dof.gob.mx"}:
        raise ValueError(f"El DOF devolvio un enlace fuera de su dominio: {url}")
    return url


@dataclass(frozen=True, slots=True)
class ParsedDofPage:
    publication_date: date
    edition: str
    source_page_url: str
    resolver_url: str
    entries: tuple[Entry, ...]
    cod_diario: str | None
    sections: tuple[str, ...]


def parse_dof_issue_page(
    body: bytes,
    page_url: str,
    *,
    expected_date: date | None = None,
    expected_edition: str | None = None,
) -> ParsedDofPage | None:
    """Interpreta el indice del DOF. Una pagina sin edicion regresa ``None``."""

    _allowed_dof_url(page_url)
    document = html.fromstring(_decode_html(body), base_url=page_url)
    page_text = _clean_text(document.text_content())
    folded_page_text = _fold_text(page_text)

    # El portal usa este mensaje para sábados, domingos, festivos y cualquier
    # fecha sin ejemplar. Es un resultado válido, no un error del scraper.
    if "no hay datos para la fecha seleccionada" in folded_page_text:
        return None

    marker = _ISSUE_MARKER.search(page_text)
    if not marker:
        title = _clean_text(" ".join(document.xpath("//title/text()")))
        if "diario oficial de la federacion" not in _fold_text(title):
            preview = page_text[:180]
            raise ValueError(
                "La respuesta ya no parece ser una pagina del DOF "
                f"(url={page_url!r}, titulo={title!r}, inicio={preview!r})"
            )
        return None

    publication_date = date.fromisoformat(
        f"{marker.group(1)[6:10]}-{marker.group(1)[3:5]}-{marker.group(1)[0:2]}"
    )
    edition_label = marker.group(2).casefold()
    edition = "MAT" if edition_label.startswith("mat") else "VES"

    if expected_date is not None and publication_date != expected_date:
        return None
    if expected_edition is not None and edition != expected_edition.upper():
        return None

    resolver_url: str | None = None
    for anchor in document.xpath('//a[contains(@onclick, "nota_to_pdf.php")]'):
        match = _RESOLVER_PATH.search(anchor.get("onclick", ""))
        if match:
            resolver_url = _allowed_dof_url(
                urljoin(page_url, html_stdlib.unescape(match.group(1)))
            )
            break
    if resolver_url is None:
        raise ValueError("La edicion existe, pero no se encontro su enlace PDF")

    current_section: str | None = None
    current_authority: str | None = None
    current_agency: str | None = None
    sections: list[str] = []
    entries: list[Entry] = []

    for row in document.xpath("//tr"):
        direct_cells = row.xpath("./td")
        for cell in direct_cells:
            classes = set((cell.get("class") or "").split())
            heading = _clean_text(cell.text_content())
            if not heading:
                continue
            if "txt_blanco" in classes:
                current_section = heading
                current_authority = None
                current_agency = None
                if heading not in sections:
                    sections.append(heading)
            elif "txt_blanco2" in classes:
                current_authority = heading
                current_agency = None
            elif "subtitle_azul" in classes:
                current_agency = heading

        anchors = row.xpath('./td/a[contains(@href, "nota_detalle.php")]')
        if len(anchors) != 1:
            continue
        anchor = anchors[0]
        title = _clean_text(anchor.text_content())
        if not title:
            continue
        entry_url = _allowed_dof_url(urljoin(page_url, anchor.get("href", "")))
        query = parse_qs(urlsplit(entry_url).query)
        external_id = query.get("codigo", [""])[0]
        if not external_id:
            external_id = hashlib.sha256(entry_url.encode("utf-8")).hexdigest()[:20]
        entries.append(
            Entry(
                external_id=external_id,
                order=len(entries) + 1,
                title=title,
                url=entry_url,
                section=current_section,
                authority=current_authority,
                agency=current_agency,
            )
        )

    cod_diario: str | None = None
    for anchor in document.xpath('//a[contains(@href, "cod_diario=")]'):
        absolute = urljoin(page_url, anchor.get("href", ""))
        value = parse_qs(urlsplit(absolute).query).get("cod_diario", [None])[0]
        if value:
            cod_diario = value
            break

    return ParsedDofPage(
        publication_date=publication_date,
        edition=edition,
        source_page_url=page_url,
        resolver_url=resolver_url,
        entries=tuple(entries),
        cod_diario=cod_diario,
        sections=tuple(sections),
    )


def parse_dof_pdf_redirect(body: bytes, resolver_url: str) -> str:
    text = body.decode("utf-8", errors="replace")
    match = _DIRECT_PDF_REDIRECT.search(text)
    if not match:
        text = body.decode("iso-8859-1", errors="replace")
        match = _DIRECT_PDF_REDIRECT.search(text)
    if not match:
        raise ValueError("El DOF no devolvio la ruta final del PDF")
    return _allowed_dof_url(urljoin(resolver_url, html_stdlib.unescape(match.group(1))))


class DofSource:
    key = "dof"
    display_name = "Diario Oficial de la Federacion"

    def __init__(self, client: HttpClient) -> None:
        self.client = client

    def discover(self, start: date, end: date) -> list[Issue]:
        issues: list[Issue] = []
        for publication_date in _iter_dates(start, end):
            for edition in ("MAT", "VES"):
                page_url = (
                    f"{DOF_INDEX_URL}?year={publication_date.year:04d}"
                    f"&month={publication_date.month:02d}&day={publication_date.day:02d}"
                    f"&edicion={edition}"
                )
                response = self.client.get(page_url)
                parsed = parse_dof_issue_page(
                    response.body,
                    response.url,
                    expected_date=publication_date,
                    expected_edition=edition,
                )
                if parsed is None:
                    continue

                redirect = self.client.get(parsed.resolver_url)
                content_type = redirect.headers.get("content-type", "").lower()
                if content_type.startswith("application/pdf"):
                    pdf_url = _allowed_dof_url(redirect.url)
                else:
                    pdf_url = parse_dof_pdf_redirect(redirect.body, parsed.resolver_url)

                issue_id = f"dof:{publication_date.isoformat()}:{edition}"
                filename = f"DOF_{publication_date.isoformat()}_{edition}.pdf"
                relative_path = str(
                    PurePosixPath(
                        "pdfs",
                        "dof",
                        f"{publication_date.year:04d}",
                        f"{publication_date.month:02d}",
                        f"{publication_date.day:02d}",
                        edition,
                        filename,
                    )
                )
                document = Document(
                    id=f"{issue_id}:completo",
                    issue_id=issue_id,
                    url=pdf_url,
                    original_url=parsed.resolver_url,
                    relative_path=relative_path,
                    label="Ejemplar completo",
                )
                issues.append(
                    Issue(
                        id=issue_id,
                        source=self.key,
                        publication_date=publication_date,
                        source_page_url=parsed.source_page_url,
                        edition=edition,
                        documents=(document,),
                        entries=parsed.entries,
                        metadata={
                            "edition_label": EDITION_LABELS[edition],
                            "cod_diario": parsed.cod_diario,
                            "sections": list(parsed.sections),
                            "entry_count": len(parsed.entries),
                        },
                    )
                )
        return issues


__all__ = [
    "DofSource",
    "ParsedDofPage",
    "parse_dof_issue_page",
    "parse_dof_pdf_redirect",
]
