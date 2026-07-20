"""U21-a: token frequency and FERTILITY over real EN/BM/ZH text.

🔴 Why this is the package's highest-value measurement (doc 06 §4.4, doc 07 §3): fertility is
simultaneously the accuracy metric, the latency metric AND the chunk-count metric. One
measurement settles three budgets.

Unsupervised by construction — token frequency needs no labels and no PII, only raw text, which
is why CLAUDE.md marks U21-a as FREE and available now while U21-b (trimmed vocabulary) stays
blocked. Corpus is Wikipedia (CC BY-SA); only counts leave this script, never text.

🔴 And it is ONE-SIDED: trimming only ever RAISES fertility. If the stock vocabulary is already
bad on BM/ZH, that is a FINAL answer and no trimming plan can rescue it.

    python scripts/measure_fertility.py --tokens-per-lang 1000000
"""
from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path

LANGS = {
    "en": "20231101.en",
    "ms": "20231101.ms",   # Malay — the wedge language with the least support
    "zh": "20231101.zh",
}


def main() -> None:
    from datasets import load_dataset
    from transformers import AutoTokenizer

    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="microsoft/mdeberta-v3-base")
    ap.add_argument("--tokens-per-lang", type=int, default=1_000_000)
    ap.add_argument("--out", type=Path, default=Path("artifacts/reports/fertility.json"))
    ap.add_argument("--save-ranking", type=Path,
                    help="write the frequency-ordered token ids, so a trim can be built from the "
                         "measurement instead of re-deriving it")
    args = ap.parse_args()

    tok = AutoTokenizer.from_pretrained(args.model)
    vocab_size = len(tok)
    print(f"tokenizer: {args.model}  vocab {vocab_size}")

    per_lang: dict[str, dict] = {}
    global_counts: collections.Counter[int] = collections.Counter()
    lang_counts: dict[str, collections.Counter[int]] = {}

    for lang, config in LANGS.items():
        ds = load_dataset("wikimedia/wikipedia", config, split="train", streaming=True)
        counts: collections.Counter[int] = collections.Counter()
        n_tokens = n_chars = n_docs = 0

        for row in ds:
            text = (row.get("text") or "").strip()
            if len(text) < 200:  # skip stubs; they distort the character ratio
                continue
            ids = tok(text, add_special_tokens=False, truncation=False)["input_ids"]
            counts.update(ids)
            n_tokens += len(ids)
            n_chars += len(text)
            n_docs += 1
            if n_tokens >= args.tokens_per_lang:
                break

        # 🔴 THE number: tokens per character. CJK writes more meaning per character, so a
        # paste of the same visual length is more tokens, more 512-chunks, more forward passes
        # (doc 06 §4.2/§4.3).
        fertility = n_tokens / n_chars if n_chars else 0.0
        per_lang[lang] = {
            "docs": n_docs, "tokens": n_tokens, "chars": n_chars,
            "tokens_per_char": fertility,
            "distinct_ids": len(counts),
        }
        global_counts.update(counts)
        lang_counts[lang] = counts
        print(f"  {lang}: {n_docs:5d} docs  {n_tokens:>9,} tokens  {n_chars:>10,} chars  "
              f"fertility {fertility:.4f} tok/char  {len(counts):>6} distinct ids")

    # Vocabulary coverage: how many entries are needed to cover 99.9% of real tokens, and --
    # the question naive trimming gets wrong -- how much of that requirement is BM/ZH.
    print("\nvocabulary needed for coverage of the COMBINED corpus:")
    total = sum(global_counts.values())
    ranked = [i for i, _ in global_counts.most_common()]
    running = 0
    thresholds = {}
    for rank, tid in enumerate(ranked, start=1):
        running += global_counts[tid]
        for target in (0.99, 0.999, 0.9999):
            if target not in thresholds and running / total >= target:
                thresholds[target] = rank
    for target, rank in sorted(thresholds.items()):
        print(f"   {target:.4%} coverage needs {rank:>7,} vocabulary entries")

    # 🔴 The number that decides whether trimming is viable. A naive "keep the first N ids" trim
    # follows the GLOBAL id order, which is dominated by high-resource languages — so it can look
    # fine in aggregate while gutting BM/ZH. Per doc 06 §6.3 the wedge is what trimming eats, and
    # this is where that shows up or does not.
    print("\nnaive 'keep the first N ids' — token coverage BY LANGUAGE:")
    header = "".join(f"{l:>10}" for l in LANGS)
    print(f"   {'cutoff':>8}{header}{'combined':>11}")
    naive = {}
    for cutoff in (30_000, 50_000, 70_000, 100_000, 150_000, 200_000):
        row = {}
        for lang, counts in lang_counts.items():
            tot = sum(counts.values())
            row[lang] = sum(c for i, c in counts.items() if i < cutoff) / tot if tot else 0.0
        combined = sum(c for i, c in global_counts.items() if i < cutoff) / total
        naive[cutoff] = {**row, "combined": combined}
        print(f"   {cutoff:>8}" + "".join(f"{row[l]:>10.4f}" for l in LANGS) + f"{combined:>11.4f}")

    # A frequency-ordered trim keeps the N most frequent tokens IN THIS CORPUS, which is what a
    # correct trim would do. Compare it against the naive cut to price the difference.
    print("\nfrequency-ordered trim (the correct method) — coverage BY LANGUAGE:")
    print(f"   {'keep':>8}{header}{'combined':>11}")
    freq_rank = {tid: r for r, (tid, _) in enumerate(global_counts.most_common())}
    freq = {}
    for keep in (30_000, 50_000, 70_000, 100_000, 150_000):
        row = {}
        for lang, counts in lang_counts.items():
            tot = sum(counts.values())
            row[lang] = sum(c for i, c in counts.items()
                            if freq_rank.get(i, 10**9) < keep) / tot if tot else 0.0
        combined = sum(c for i, c in global_counts.items()
                       if freq_rank.get(i, 10**9) < keep) / total
        freq[keep] = {**row, "combined": combined}
        print(f"   {keep:>8}" + "".join(f"{row[l]:>10.4f}" for l in LANGS) + f"{combined:>11.4f}")

    if args.save_ranking:
        args.save_ranking.parent.mkdir(parents=True, exist_ok=True)
        args.save_ranking.write_text(
            json.dumps({"ordered_ids": [int(i) for i, _ in global_counts.most_common()],
                        "counts": {str(i): int(c) for i, c in global_counts.items()}}),
            encoding="utf-8")
        print(f"wrote ranking -> {args.save_ranking}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({
        "model": args.model,
        "vocab_size": vocab_size,
        "per_lang": per_lang,
        "coverage_thresholds": {str(k): v for k, v in thresholds.items()},
        "naive_id_cutoff_coverage": {str(k): v for k, v in naive.items()},
        "frequency_ordered_coverage": {str(k): v for k, v in freq.items()},
        "corpus": "wikimedia/wikipedia (CC BY-SA) — counts only, no text retained",
    }, indent=2), encoding="utf-8")
    print(f"\nwrote {args.out}")

    en = per_lang["en"]["tokens_per_char"]
    print("\nfertility relative to English (doc 06 §4.3 estimated CJK ~3x):")
    for lang, d in per_lang.items():
        print(f"   {lang}: {d['tokens_per_char']/en:.2f}x")


if __name__ == "__main__":
    main()
