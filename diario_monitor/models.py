from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any


@dataclass(frozen=True, slots=True)
class Entry:
    """Una disposición o nota listada en el índice de una edición."""

    external_id: str
    order: int
    title: str
    url: str
    section: str | None = None
    authority: str | None = None
    agency: str | None = None


@dataclass(frozen=True, slots=True)
class Document:
    """Un PDF perteneciente a una edición."""

    id: str
    issue_id: str
    url: str
    original_url: str
    relative_path: str
    label: str
    part_number: int | None = None


@dataclass(frozen=True, slots=True)
class Issue:
    """Una edición publicada por una fuente oficial."""

    id: str
    source: str
    publication_date: date
    source_page_url: str
    edition: str | None = None
    issue_number: str | None = None
    documents: tuple[Document, ...] = ()
    entries: tuple[Entry, ...] = ()
    metadata: dict[str, Any] = field(default_factory=dict)

