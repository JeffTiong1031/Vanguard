"""Assemble a transformers.js-loadable directory from an ONNX export.

🔴 transformers.js resolves a model by CONVENTION, not by pointing at files:

    <base>/<model-id>/config.json
    <base>/<model-id>/tokenizer.json
    <base>/<model-id>/tokenizer_config.json
    <base>/<model-id>/onnx/model.onnx          (+ model.onnx.data for external weights)

The ONNX export writes a flat directory with `labels.json` instead of `config.json` and the
graph at the root rather than under `onnx/`, so pointing transformers.js at it fails — and it
fails by not finding files, which surfaces as a stalled or rejected load rather than anything
naming the layout. Observed 2026-07-20: the classifier silently never ran and every entity kept
being masked, which looks exactly like the classifier disagreeing with you.

    python scripts/build_web_bundle.py \
        --export artifacts/export/sens-v0.2.0-trim70k \
        --checkpoint artifacts/runs/colab_v7_trim70k \
        --out artifacts/web/sens
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path


def _sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--export", type=Path, required=True, help="ONNX export directory")
    ap.add_argument("--checkpoint", type=Path, required=True, help="HF checkpoint (for config.json)")
    ap.add_argument("--out", type=Path, required=True, help="<base>/<model-id> to create")
    args = ap.parse_args()

    onnx_dir = args.out / "onnx"
    onnx_dir.mkdir(parents=True, exist_ok=True)

    # config.json carries id2label, which is what turns a logit index into "KEEP"/"MASK".
    cfg = json.loads((args.checkpoint / "config.json").read_text(encoding="utf-8"))
    labels = cfg.get("id2label")
    if not labels:
        raise SystemExit("checkpoint config.json has no id2label — the pipeline cannot name its output")
    (args.out / "config.json").write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    print(f"config.json      id2label={labels}")

    for name in ("tokenizer.json", "tokenizer_config.json", "special_tokens_map.json"):
        src = args.export / name
        if not src.exists():
            src = args.checkpoint / name
        if src.exists():
            shutil.copy2(src, args.out / name)
            print(f"{name:24s} {src.stat().st_size/1024/1024:7.1f} MB")

    for name in ("model.onnx", "model.onnx.data"):
        src = args.export / name
        if src.exists():
            shutil.copy2(src, onnx_dir / name)
            print(f"onnx/{name:19s} {src.stat().st_size/1024/1024:7.1f} MB")

    files = sorted(p for p in args.out.rglob("*") if p.is_file() and p.name != "SHA256SUMS")
    (args.out / "SHA256SUMS").write_text(
        "\n".join(f"{_sha256(p)}  {p.relative_to(args.out).as_posix()}" for p in files) + "\n",
        encoding="utf-8")

    total = sum(p.stat().st_size for p in files) / 1024 / 1024
    print(f"\nwrote {args.out}  ({total:.0f} MB, {len(files)} files)")
    print(f"serve the PARENT directory; the model id is {args.out.name!r}")


if __name__ == "__main__":
    main()
