from __future__ import annotations

import argparse
import json
import os
from dataclasses import asdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from .google_store import GoogleStore
from .http import HttpClient
from .pipeline import Pipeline
from .sources import DofSource, NuevoLeonSource


TIMEZONE = "America/Monterrey"


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="DOF + Periódico Oficial NL -> OCR -> Drive -> Sheets")
    p.add_argument("--lookback-days", type=int, default=int(os.getenv("LOOKBACK_DAYS", "7")))
    p.add_argument("--from-date", type=date.fromisoformat)
    p.add_argument("--to-date", type=date.fromisoformat)
    p.add_argument("--source", choices=("all", "dof", "nuevo-leon"), default="all")
    p.add_argument("--ocr-dpi", type=int, default=int(os.getenv("OCR_DPI", "150")))
    p.add_argument("--ocr-workers", type=int, default=int(os.getenv("OCR_WORKERS", "4")))
    p.add_argument("--json", action="store_true")
    return p


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Falta la variable/secreto {name}")
    return value


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    today = datetime.now(ZoneInfo(TIMEZONE)).date()
    end = args.to_date or today
    start = args.from_date or (end - timedelta(days=max(1, args.lookback_days) - 1))

    client = HttpClient(timeout=90, retries=4, min_delay=0.8)
    available = {
        "dof": DofSource(client),
        "nuevo-leon": NuevoLeonSource(client),
    }
    sources = list(available.values()) if args.source == "all" else [available[args.source]]

    store = GoogleStore(
        service_account_json=required_env("GOOGLE_SERVICE_ACCOUNT_JSON"),
        spreadsheet_id=required_env("GOOGLE_SHEET_ID"),
        sheet_tab=os.getenv("GOOGLE_SHEET_TAB", "Monitor").strip() or "Monitor",
        root_folder_id=required_env("GOOGLE_DRIVE_ROOT_FOLDER_ID"),
    )

    summary = Pipeline(
        client=client,
        store=store,
        sources=sources,
        ocr_dpi=args.ocr_dpi,
        ocr_workers=args.ocr_workers,
    ).run(start, end)

    payload = {"from": start.isoformat(), "to": end.isoformat(), **asdict(summary)}
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(payload)

    if summary.errors:
        print("Errores:")
        for error in summary.errors:
            print("-", error)
    return 0 if summary.failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
