"""ONNX export as a MEASUREMENT GATE, not an assumed success.

mDeBERTa-v3 via naive `torch.onnx.export` is historically fragile. This attempts the export,
then VERIFIES it with an ONNX Runtime CPU round-trip against the torch model. On mismatch it
STOPS: ONNX is recorded BLOCKED/[unverified] and the HF checkpoint stays the hand-off artifact.

It also measures on-device SIZE, which the export step is the only place to learn. Doc 06 §6.2
sets a trigger: if the memory budget lands below ~140 MB of weights, distillation moves from a
risk to a Phase 0 requirement, and per CLAUDE.md §6.2 vocabulary trimming buys exactly one
halving before it is exhausted. mDeBERTa-v3-base is ~279M parameters, ~69% of it a lookup
table, so the fp32 and int8 figures printed here are the ones that decide whether that trigger
fires. Nobody in this track had measured them.

Nothing under artifacts/ is committed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

MB = 1024 * 1024
# doc 06 §6.2 — below this weight budget, distillation stops being a risk and becomes required.
DISTILLATION_TRIGGER_MB = 140


def _sha256(p: Path) -> str:
    h = hashlib.sha256()
    h.update(p.read_bytes())
    return h.hexdigest()


def _export(model, tok, path: Path, opset: int) -> None:
    import torch

    dummy = tok("Chase payment from [E] AcmeX [/E] today.", return_tensors="pt")
    common = dict(
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "attention_mask": {0: "batch", 1: "seq"},
            "logits": {0: "batch"},
        },
        opset_version=opset,
    )
    try:
        torch.onnx.export(model, (dummy["input_ids"], dummy["attention_mask"]), str(path), **common)
    except TypeError:
        # torch 2.x may route through the dynamo exporter; ask for the legacy path explicitly.
        torch.onnx.export(model, (dummy["input_ids"], dummy["attention_mask"]), str(path),
                          dynamo=False, **common)


def main() -> None:
    import numpy as np
    import onnxruntime as ort
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    ap = argparse.ArgumentParser(description="ONNX export + ORT round-trip gate + size measurement")
    ap.add_argument("--model", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--opset", type=int, default=17)
    ap.add_argument("--tol", type=float, default=1e-3)
    ap.add_argument("--quantize", action="store_true",
                    help="also emit a dynamic-int8 model and re-run the gate against it")
    ap.add_argument("--int8-tol", type=float, default=0.5,
                    help="int8 is lossy by construction, so it gets its own, looser tolerance; "
                         "the number that matters is whether the ARGMAX still agrees")
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    tok = AutoTokenizer.from_pretrained(str(args.model))  # already carries [E] / [/E]
    model = AutoModelForSequenceClassification.from_pretrained(str(args.model)).eval()

    n_params = sum(p.numel() for p in model.parameters())
    emb = model.get_input_embeddings().weight.numel()
    print(f"parameters: {n_params/1e6:.1f}M  (embedding {emb/1e6:.1f}M = {emb/n_params*100:.0f}%)")

    onnx_path = args.out / "model.onnx"
    _export(model, tok, onnx_path, args.opset)

    checks = [
        "Chase payment from [E] AcmeX [/E] today.",
        "Explain [E] Einstein [/E] 's theory.",
        "请把合同发给 [E] 张伟 [/E] 。",
        "Tolong ingatkan [E] Encik Rahman [/E] pasal mesyuarat.",
    ]

    def gate(path: Path, tol: float, label: str) -> tuple[float, bool]:
        sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        max_diff = 0.0
        argmax_ok = True
        with torch.no_grad():
            for s in checks:
                enc = tok(s, return_tensors="pt")
                t = model(**enc).logits.numpy()
                o = sess.run(["logits"], {"input_ids": enc["input_ids"].numpy(),
                                          "attention_mask": enc["attention_mask"].numpy()})[0]
                max_diff = max(max_diff, float(np.abs(t - o).max()))
                argmax_ok &= bool((t.argmax(-1) == o.argmax(-1)).all())
        ok = max_diff <= tol and argmax_ok
        print(f"{label}: max abs diff {max_diff:.4g} (tol {tol})  argmax agrees: {argmax_ok}  "
              f"-> {'OK' if ok else 'MISMATCH'}")
        return max_diff, ok

    diff, ok = gate(onnx_path, args.tol, "fp32 round-trip")
    if not ok:
        raise SystemExit(
            f"ONNX round-trip MISMATCH: max abs diff {diff:.4g} > tol {args.tol:.4g}. "
            f"STOP — record ONNX as BLOCKED/[unverified]. The HF checkpoint at {args.model} "
            f"remains the valid hand-off artifact; do not ship this .onnx."
        )

    # A model this size exceeds the 2 GB protobuf limit, so weights land beside the graph in
    # model.onnx.data. Counting only model.onnx would report ~0.1 MB and be nonsense.
    def _artifact_mb(p: Path) -> float:
        total = p.stat().st_size
        ext = p.with_suffix(p.suffix + ".data")
        if ext.exists():
            total += ext.stat().st_size
        return total / MB

    sizes = {"fp32_mb": _artifact_mb(onnx_path)}
    int8_status = "not attempted"

    if args.quantize:
        from onnxruntime.quantization import QuantType, quantize_dynamic

        q_path = args.out / "model.int8.onnx"
        try:
            # The exporter records value_info that disagrees with the graph at the classifier
            # head, and the quantizer's shape-inference pass rejects it:
            #   InferenceError: Inferred shape and existing shape differ in dimension 0: (768) vs (2)
            # Dropping the stale annotations and letting inference recompute them fixes it.
            # This is a repair of the recorded metadata, not of the computation — the int8
            # round-trip below is what actually decides whether the artifact is usable.
            import onnx

            graph = onnx.load(str(onnx_path))
            del graph.graph.value_info[:]
            clean = args.out / "model.clean.onnx"
            onnx.save(graph, str(clean), save_as_external_data=True,
                      location="model.clean.onnx.data", all_tensors_to_one_file=True)
            quantize_dynamic(str(clean), str(q_path), weight_type=QuantType.QInt8,
                             use_external_data_format=True)
            measured = _artifact_mb(q_path)
            # int8 is lossy, so the pass condition is the ARGMAX, not the raw logit distance.
            _, q_ok = gate(q_path, args.int8_tol, "int8 round-trip")
            if q_ok:
                sizes["int8_mb"] = measured
                int8_status = "verified"
            else:
                # Measured 2026-07-19: forcing past the shape-inference error produces a graph
                # that RUNS and predicts KEEP for everything — accuracy 0.50, MASK recall 0.000,
                # uniformly across en/bm/zh/mixed. The refusal was protecting us. Record the
                # size for the record, delete the artifact so it cannot be shipped by accident.
                int8_status = (f"BLOCKED - round-trip mismatch; the artifact is degenerate "
                               f"(measured {measured:.0f} MB, not shipped)")
                sizes["int8_mb_rejected"] = measured
                for p in (q_path, q_path.with_suffix(q_path.suffix + ".data")):
                    if p.exists():
                        p.unlink()
                print(f"\n🔴 int8 artifact REJECTED and deleted: round-trip mismatch. "
                      f"Its size was {measured:.0f} MB.")
        except Exception as e:  # noqa: BLE001
            # Recorded, not worked around. A measurement gate that quietly succeeds by some
            # other route is not a measurement.
            int8_status = f"BLOCKED - {type(e).__name__}: {str(e)[:160]}"
            print(f"\n🔴 int8 quantization BLOCKED: {int8_status}")
            # An analytic floor is still worth having, clearly labelled as an estimate:
            # one byte per parameter plus graph overhead.
            sizes["int8_mb_estimate"] = n_params / MB
            print(f"   analytic int8 estimate (1 byte/param): ~{n_params/MB:.0f} MB (estimate)")

    print("\n--- on-device size (doc 06 §6.2) ---")
    for k, v in sizes.items():
        print(f"  {k:10s} {v:8.1f} MB")
    # Only VERIFIED artifacts count. A rejected int8 graph has a size and no standing.
    shippable = {k: v for k, v in sizes.items() if not k.endswith("_rejected")
                 and not k.endswith("_estimate")}
    smallest = min(shippable.values()) if shippable else float("inf")
    print(f"\n  smallest VERIFIED artifact: {smallest:.0f} MB")
    print(f"  🔴 ~{DISTILLATION_TRIGGER_MB} MB is what doc 06 §6.2 expects TRIMMING to ACHIEVE, "
          f"not a ceiling to fit under.\n     The budget is ASSUMPTIONS.md D2: ~1-2 GB addressable. "
          f"Compare against that, and remember\n     doc 06 §6.1 wants the 1.5-2x runtime multiple "
          f"MEASURED on D2, in Chinese, not inherited.")

    tok.save_pretrained(str(args.out))
    (args.out / "labels.json").write_text(json.dumps(model.config.id2label), encoding="utf-8")
    (args.out / "size_report.json").write_text(
        json.dumps({"parameters": n_params, "embedding_parameters": emb, **sizes,
                    "fp32_roundtrip_max_abs_diff": diff,
                    "fp32_onnx": "verified", "int8_onnx": int8_status,
                    "distillation_trigger_mb": DISTILLATION_TRIGGER_MB}, indent=2), encoding="utf-8")

    # model.clean.* is quantization scaffolding, not a shippable artifact; leaving it in the
    # directory would double the hand-off size and put an unverified graph next to the verified one.
    for scratch in args.out.glob("model.clean.onnx*"):
        scratch.unlink()

    sums = args.out / "SHA256SUMS"
    lines = [f"{_sha256(p)}  {p.name}" for p in sorted(args.out.iterdir())
             if p.is_file() and p.name != "SHA256SUMS"]
    sums.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nwrote {onnx_path.name} + SHA256SUMS ({len(lines)} files)")


if __name__ == "__main__":
    main()
