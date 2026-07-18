"""Train the mDeBERTa-v3-base span classifier (marked-span sequence classification).

One instance per span: the target span is wrapped in [E] ... [/E] markers and the whole
prompt is classified MASK/KEEP. Context on both sides is preserved (sens.marking).

Deviations from the plan's sketch, all forced by the installed library versions and each
verified by running, not by reading release notes:
  - `Trainer(tokenizer=...)` was removed in transformers 5.x -> `processing_class=`.
  - `compute_loss` gained `num_items_in_batch`; the override accepts **kwargs.
  - `TrainingArguments(eval_strategy=...)` is 4.41+ / 5.x; older 4.x used
    `evaluation_strategy`. Both are attempted so the script runs on Colab whichever it has.

Ship-status note: nothing this script prints is ship evidence. Dev metrics guide tuning;
the only ship signal is Task 19's eval on the locked human_simulated exam.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

LABEL2ID = {"KEEP": 0, "MASK": 1}
ID2LABEL = {0: "KEEP", 1: "MASK"}


def _training_args(TrainingArguments, **kw):
    """eval_strategy (>=4.41) vs evaluation_strategy (older). Try new, fall back."""
    try:
        return TrainingArguments(eval_strategy="epoch", **kw)
    except TypeError:
        return TrainingArguments(evaluation_strategy="epoch", **kw)


def main() -> None:
    import numpy as np
    from datasets import Dataset
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        Trainer,
        TrainingArguments,
    )

    from sens.marking import E_CLOSE, E_OPEN, iter_span_instances
    from sens.metrics import mask_precision_recall
    from sens.residency import assert_no_eval_in_train
    from sens.validate_jsonl import load_jsonl

    ap = argparse.ArgumentParser()
    ap.add_argument("--train", type=Path, required=True)
    ap.add_argument("--dev", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--model", default="microsoft/mdeberta-v3-base")
    ap.add_argument("--epochs", type=float, default=1.0)
    ap.add_argument("--max-len", type=int, default=512)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--lr", type=float, default=2e-5)
    ap.add_argument("--seed", type=int, default=20260718)
    ap.add_argument("--mask-weight", type=float, default=1.0,
                    help="loss weight for the MASK class (>1 fights KEEP imbalance)")
    args = ap.parse_args()

    if args.model == "xlm-roberta-base":
        raise SystemExit("xlm-roberta-base is forbidden as the baseline (Global Constraints).")

    train_rows = load_jsonl(args.train)
    dev_rows = load_jsonl(args.dev)
    assert_no_eval_in_train(train_rows)
    assert_no_eval_in_train(dev_rows)

    # ADR 0023: synthetic may go to Colab; anything human_simulated/real stays on local MY infra.
    for rows, name in ((train_rows, "train"), (dev_rows, "dev")):
        if any(r.provenance in {"human_simulated", "real"} for r in rows):
            print(f"NOTE: {name} contains non-synthetic data — keep this run on local MY infra, not Colab.")

    def to_records(rows):
        recs = []
        for ex in rows:
            for marked, label, _etype in iter_span_instances(ex):
                recs.append({"text": marked, "label": LABEL2ID[label]})
        if not recs:
            raise SystemExit("no span instances found — training data has no PER/ORG spans")
        return recs

    train_recs, dev_recs = to_records(train_rows), to_records(dev_rows)
    n_mask = sum(r["label"] == LABEL2ID["MASK"] for r in train_recs)
    print(f"train instances: {len(train_recs)} (MASK {n_mask}, KEEP {len(train_recs) - n_mask})")
    print(f"dev   instances: {len(dev_recs)}")

    tok = AutoTokenizer.from_pretrained(args.model)
    tok.add_special_tokens({"additional_special_tokens": [E_OPEN, E_CLOSE]})
    model = AutoModelForSequenceClassification.from_pretrained(
        args.model, num_labels=2, id2label=ID2LABEL, label2id=LABEL2ID
    )
    model.resize_token_embeddings(len(tok))

    def tok_fn(batch):
        return tok(batch["text"], truncation=True, max_length=args.max_len)

    train_ds = Dataset.from_list(train_recs).map(tok_fn, batched=True)
    dev_ds = Dataset.from_list(dev_recs).map(tok_fn, batched=True)

    def compute_metrics(p):
        preds = np.argmax(p.predictions, axis=1)
        gold_l = [ID2LABEL[int(i)] for i in p.label_ids]
        pred_l = [ID2LABEL[int(i)] for i in preds]
        pr, rc = mask_precision_recall(gold_l, pred_l)
        return {"mask_precision": pr, "mask_recall": rc}

    targs = _training_args(
        TrainingArguments,
        output_dir=str(args.out),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch,
        learning_rate=args.lr,
        seed=args.seed,
        save_strategy="epoch",
        logging_steps=5,
        report_to=[],
    )

    trainer_cls = Trainer
    if args.mask_weight != 1.0:
        import torch

        class WeightedTrainer(Trainer):
            def compute_loss(self, model, inputs, return_outputs=False, **kw):
                labels = inputs.pop("labels")
                outputs = model(**inputs)
                weight = torch.tensor([1.0, args.mask_weight], device=outputs.logits.device)
                loss = torch.nn.functional.cross_entropy(outputs.logits, labels, weight=weight)
                return (loss, outputs) if return_outputs else loss

        trainer_cls = WeightedTrainer
        print(f"using WeightedTrainer (mask_weight={args.mask_weight})")

    try:
        trainer = trainer_cls(model=model, args=targs, train_dataset=train_ds,
                              eval_dataset=dev_ds, processing_class=tok,
                              compute_metrics=compute_metrics)
    except TypeError:  # transformers 4.x
        trainer = trainer_cls(model=model, args=targs, train_dataset=train_ds,
                              eval_dataset=dev_ds, tokenizer=tok,
                              compute_metrics=compute_metrics)

    trainer.train()
    args.out.mkdir(parents=True, exist_ok=True)
    trainer.save_model(str(args.out))
    tok.save_pretrained(str(args.out))

    metrics = trainer.evaluate()
    metrics["_run"] = {
        "model": args.model, "epochs": args.epochs, "batch": args.batch, "lr": args.lr,
        "seed": args.seed, "mask_weight": args.mask_weight,
        "train_file": str(args.train), "dev_file": str(args.dev),
        "train_instances": len(train_recs), "dev_instances": len(dev_recs),
    }
    (args.out / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))
    print("\nNOTE: dev metrics are for tuning only. Ship evidence is Task 19 on the locked exam.")


if __name__ == "__main__":
    main()
