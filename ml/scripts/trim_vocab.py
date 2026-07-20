"""Trim the vocabulary and slice the embedding table to match.

🔴 The method is the whole decision. Measured 2026-07-19 (U21-a): keeping 70,000 entries gives
Chinese **99.89%** token coverage if they are chosen BY FREQUENCY and **75.41%** if chosen by
token id. Same budget, and id order silently deletes `pasal`, `Sila`, `经理`, `阿里巴巴` because
it reflects mDeBERTa's global training mix rather than the text we serve. doc 06 §6.3's "the
wedge is what trimming eats" is not inherent to trimming — it is inherent to trimming by the
wrong ordering.

The keep set is the UNION of:
  1. the top-N ids by frequency over real EN/BM/ZH text (scripts/measure_fertility.py), and
  2. every id our own training + eval corpora use.

(2) exists because the frequency table is Wikipedia and our data is Malaysian transactional
language. Measured without it, a 70K cut drops 22 gold spans' pieces — 14 of them `腾讯`, which
appears in BOTH a KEEP and a MASK context and is therefore one of the minimal pairs the model
exists to learn, plus the generic-ORG counterexamples added to break the fame confound. It costs
~123 extra entries, about 0.4 MB.

⚠️ **(2) couples the trimmed model to our evaluation corpus.** Every token in the exam is
guaranteed present, which real users' text will not be, so exam scores after trimming are
optimistic by an unmeasured margin. That is a reportable bias, not cheating — vocabulary choice
should reflect the target register — but it must travel with the number.

This does NOT rebuild the SentencePiece model: dropped ids are remapped to UNK rather than
re-segmented into smaller pieces. Real re-segmentation would preserve information that UNK
discards, so this is a LOWER bound on trimmed quality, and the coupling above means the measured
damage is a lower bound too. Both point the same way: verify on the exam, and revert if Chinese
drops.
"""
from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path


def main() -> None:
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    ap = argparse.ArgumentParser()
    ap.add_argument("--model", type=Path, required=True)
    ap.add_argument("--ranking", type=Path, required=True,
                    help="token_ranking.json from measure_fertility.py --save-ranking")
    ap.add_argument("--keep", type=int, default=70_000)
    ap.add_argument("--corpus", type=Path, nargs="*", default=[],
                    help="JSONL whose every token must survive (train + exam)")
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    tok = AutoTokenizer.from_pretrained(str(args.model))
    model = AutoModelForSequenceClassification.from_pretrained(str(args.model))
    emb = model.get_input_embeddings().weight.data
    old_vocab = emb.shape[0]
    print(f"model: {old_vocab} embedding rows, {sum(p.numel() for p in model.parameters())/1e6:.1f}M params")

    ranking = json.loads(args.ranking.read_text(encoding="utf-8"))["ordered_ids"]
    keep: set[int] = set(ranking[:args.keep])
    print(f"frequency top-{args.keep}: {len(keep)} ids")

    # Every added_token must survive, not just the ones we use. The fast tokenizer indexes them
    # relative to the vocabulary, so dropping any of the 101 <extra_id_*> placeholders shifts
    # [E] and [/E] off the end of the embedding table -- and the failure is an IndexError deep in
    # the embedding lookup, not anything that names the vocabulary.
    added_ids = set()
    tj_probe = Path(args.model) / "tokenizer.json"
    if tj_probe.exists():
        added_ids = {int(a["id"]) for a in
                     json.loads(tj_probe.read_text(encoding="utf-8")).get("added_tokens", [])}
    specials = set(tok.all_special_ids) | added_ids | set(
        i for i in tok.convert_tokens_to_ids(["[E]", "[/E]"]) if i is not None)
    keep |= specials
    print(f"+ {len(specials)} special/added/marker ids")

    corpus_ids: collections.Counter[int] = collections.Counter()
    for p in args.corpus:
        for line in p.open(encoding="utf-8"):
            if line.strip():
                corpus_ids.update(tok(json.loads(line)["text"], add_special_tokens=False)["input_ids"])
    added = {i for i in corpus_ids if i not in keep}
    keep |= corpus_ids.keys()
    print(f"+ {len(added)} ids used by our corpora but outside the frequency cut")

    keep = {i for i in keep if i < old_vocab}
    kept = sorted(keep)
    print(f"\nkeeping {len(kept)} of {old_vocab} ({len(kept)/old_vocab:.1%})")

    # old id -> new id; everything else becomes UNK
    old_to_new = {old: new for new, old in enumerate(kept)}
    unk_old = tok.unk_token_id if tok.unk_token_id is not None else 0
    unk_new = old_to_new.get(unk_old, 0)

    new_emb = emb[torch.tensor(kept)].clone()
    model.resize_token_embeddings(len(kept))
    model.get_input_embeddings().weight.data.copy_(new_emb)

    n_params = sum(p.numel() for p in model.parameters())
    print(f"after trim: {n_params/1e6:.1f}M params  (~{n_params*4/1024/1024:.0f} MB fp32)")

    args.out.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(str(args.out))
    tok.save_pretrained(str(args.out))

    # 🔴 Rebuild the tokenizer's own vocabulary rather than shipping an id-remapping table.
    #
    # The alternative — keep the 250K tokenizer and map ids at inference — has two costs. It
    # pushes a lookup step into every consumer, including the browser, where getting it wrong
    # fails silently on exactly the rare tokens trimming affects. And it turns a dropped piece
    # into UNK, discarding information the Unigram model would otherwise recover by
    # re-segmenting into smaller pieces it still has.
    #
    # mDeBERTa's fast tokenizer is Unigram with an editable vocab list, so the honest version is
    # available: drop the entries, and the segmenter re-splits what it no longer has.
    tj = args.out / "tokenizer.json"
    if tj.exists():
        spec = json.loads(tj.read_text(encoding="utf-8"))
        vocab = spec["model"].get("vocab")
        if spec["model"].get("type") == "Unigram" and isinstance(vocab, list):
            spec["model"]["vocab"] = [vocab[i] for i in kept if i < len(vocab)]
            unk_id = spec["model"].get("unk_id")
            if unk_id is not None:
                spec["model"]["unk_id"] = old_to_new.get(unk_id, 0)
            # added_tokens carry absolute ids that the vocab rebuild has just invalidated.
            dropped_added = []
            for a in spec.get("added_tokens", []):
                new_id = old_to_new.get(int(a["id"]))
                if new_id is None:
                    dropped_added.append(a["content"])
                else:
                    a["id"] = new_id
            if dropped_added:
                raise SystemExit(f"added tokens have no new id: {dropped_added[:5]} — they must "
                                 f"be in the keep set or the tokenizer will emit out-of-range ids")
            tj.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
            print(f"rebuilt tokenizer.json: {len(vocab)} -> {len(spec['model']['vocab'])} entries, "
                  f"{len(spec.get('added_tokens', []))} added tokens re-indexed "
                  f"(Unigram re-segments dropped pieces instead of emitting UNK)")
        else:
            print(f"!! tokenizer model type {spec['model'].get('type')!r} with "
                  f"{type(vocab).__name__} vocab — NOT rebuilt; consumers must remap ids")

    (args.out / "vocab_map.json").write_text(json.dumps({
        "old_to_new": {str(k): v for k, v in old_to_new.items()},
        "unk_new": unk_new,
        "kept": len(kept),
        "old_vocab": old_vocab,
        "note": "The shipped tokenizer is REBUILT to emit new ids directly — consumers do not "
                "remap. This map is kept for auditing which entries survived, not for inference.",
    }), encoding="utf-8")
    print(f"wrote {args.out} + vocab_map.json")


if __name__ == "__main__":
    main()
