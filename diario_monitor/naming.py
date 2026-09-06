from __future__ import annotations

import re

from .models import Document, Issue


def _safe(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
    return value.strip("._-") or "sin_numero"


def stable_document_id(issue: Issue, document: Document) -> str:
    if issue.source == "dof":
        return f"dof:{issue.publication_date.isoformat()}:{issue.edition or 'SIN'}:completo"
    part = document.part_number or 1
    return (
        f"nuevo_leon:{issue.publication_date.isoformat()}:"
        f"{issue.issue_number or 'sin_numero'}:parte:{part:02d}"
    )


def base_filename(issue: Issue, document: Document) -> str:
    day = issue.publication_date.isoformat()
    if issue.source == "dof":
        return f"DOF_{day}_{_safe(issue.edition or 'SIN_EDICION')}"
    number = _safe(issue.issue_number or "sin_numero")
    part = document.part_number or 1
    return f"PONL_{day}_Numero_{number}_Parte_{part:02d}"
