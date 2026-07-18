# ml/scripts/generate_fixtures.py
from __future__ import annotations

from pathlib import Path

from sens.schema import Example, Span
from sens.validate_jsonl import validate_path

OUT = Path(__file__).resolve().parents[1] / "data" / "fixtures" / "tiny_train.jsonl"


def _mk(id, text, lang, spans, tags=None):
    return Example(id=id, text=text, lang=lang, provenance="llm_synthetic", split="train",
                   source="fixture", tags=tags or [],
                   spans=[Span(start=s, end=e, surface=text[s:e], entity_type=et, label=lb)
                          for (s, e, et, lb) in spans])


def build() -> list[Example]:
    rows: list[Example] = []
    rows.append(_mk("fx-einstein-keep", "Explain Einstein's theory of relativity.", "en",
                    [(8, 16, "PER", "KEEP")]))
    rows.append(_mk("fx-einstein-mask", "Einstein from accounting has not sent the invoice.", "en",
                    [(0, 8, "PER", "MASK")]))
    rows.append(_mk("fx-apple-keep", "Summarise Apple's earnings this quarter.", "en",
                    [(10, 15, "ORG", "KEEP")]))
    rows.append(_mk("fx-org-mask", "Chase payment from Bunga Raya Trading; they owe us money.", "en",
                    [(19, 37, "ORG", "MASK")]))
    rows.append(_mk("fx-bm-mask", "Sila hubungi Encik Rahman tentang bil pelanggan itu.", "bm",
                    [(13, 25, "PER", "MASK")]))
    rows.append(_mk("fx-bm-keep", "Siapakah Tunku Abdul Rahman dalam sejarah Malaysia?", "bm",
                    [(9, 27, "PER", "KEEP")]))
    rows.append(_mk("fx-zh-mask", "请把合同发给张伟。", "zh", [(6, 8, "PER", "MASK")]))
    rows.append(_mk("fx-zh-keep", "介绍一下华为公司的历史。", "zh", [(4, 6, "ORG", "KEEP")]))
    rows.append(_mk("fx-mixed", "Boss, tolong email Mr Tan the report from Apple pasal Q3.", "mixed",
                    [(19, 25, "PER", "MASK"), (42, 47, "ORG", "KEEP")]))
    rows.append(_mk("fx-ambiguous", "Ask Ali about it.", "en", [(4, 7, "PER", "KEEP")],
                    tags=["ambiguous_keep"]))
    rows.append(_mk("fx-math", "What is 1 + 1 in 2024?", "en", [], tags=["math_no_mask"]))
    rows.append(_mk("fx-iddigit", "Register 900101-14-5678 for Siti Nurhaliza's file.", "en",
                    [(28, 42, "PER", "MASK")], tags=["id_digit_line"]))
    return rows


def main() -> None:
    rows = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(r.model_dump_json() + "\n")
    errs = validate_path(OUT)
    if errs:
        raise SystemExit("fixture validation failed:\n" + "\n".join(errs))
    print(f"wrote {len(rows)} rows -> {OUT}")


if __name__ == "__main__":
    main()
