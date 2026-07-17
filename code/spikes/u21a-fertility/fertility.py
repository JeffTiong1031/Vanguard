#!/usr/bin/env python3
"""
U21-a — tokens-per-character for BM/ZH vs EN, under the STOCK mDeBERTa vocabulary.

Doc 07 §3.3. This is the measurement the package spent two documents believing was blocked.

WHY IT IS FREE
--------------
Doc 06 §4.4, doc 06 §9 and ASSUMPTIONS U21 all said the fertility spike was "blocked on the corpus
(U14/C2 -> C3)". That is a false dependency, and doc 07 §3.1 is the argument:

    U14 is a *PII* corpus. Token frequency and fertility are UNSUPERVISED -- they need no labels,
    no PII, and no annotation of any kind. Only raw text.

Doc 03 §4.2 blocked the *vocabulary pick*, correctly: a frequency table has to be representative of
what users type. Doc 06 discovered fertility also governs latency -- its best finding -- and
inherited doc 03's blocker along with the metric, without re-sizing it. The three budgets need
different fidelity. Latency needs a RATIO. A ratio is free.

WHY IT IS ONE-SIDED, WHICH IS WHY IT GOES FIRST
-----------------------------------------------
Doc 06 §4.4's own finding is that trimming can only *raise* fertility: drop vocabulary rows BM/ZH was
using and those words fall back to shorter pieces or bytes. So the STOCK vocabulary is the FLOOR.

    FAIL is FINAL.       If stock-vocab Chinese already blows the paste budget, trimming cannot
                         rescue it -- and doc 06 §6.2's distillation trigger fires through its
                         second entrance without a memory decision ever being made.
    PASS is PROVISIONAL. U21-b (trimmed vocabulary) is still owed and IS corpus-blocked.

A cheap test that can only deliver bad news definitively is the best kind to run first.

WHAT THIS SCRIPT REFUSES TO DO
------------------------------
It produces no tokens/sec. Docs 03, 05, 06 and 07 each held that line. Fertility is tokens per
character -- a property of the tokenizer and the text. Latency is a property of hardware nobody has
measured yet (U6-b). Multiplying one by a guess at the other would be the fabrication
ASSUMPTIONS.md exists to prevent.

    python fertility.py --corpus ./corpus
    # corpus/en/*.txt  corpus/ms/*.txt  corpus/zh/*.txt   (any raw text; see README.md)
"""

import argparse
import json
import math
import pathlib
import statistics
import sys
import unicodedata

# Windows consoles default to cp1252, which cannot encode "→" -- or, more to the point, cannot
# encode 陈志明, which is a script this script exists to measure. Found by running it, not by
# reading it: the first end-to-end run died here, on the machine this is written for.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

MODEL = "microsoft/mdeberta-v3-base"

# Cited, config.json -- doc 03 §4.1, doc 06 §4.1. NOT a guess.
MAX_POSITION_EMBEDDINGS = 512

# The longest spans we intend to detect. Doc 07 §6.2: the chunk overlap is bounded by OUR OWN
# detector list plus doc 03 §2.3's leading context window -- not by the user's text. It is "the one
# number in this document that is neither B3-blocked nor corpus-blocked. We own both sides."
# Measuring it here is doc 07 §6.2's "measurable in the same tokenizer pass as U21-a, at zero
# marginal cost."
#
# Every identifier below is SYNTHETIC and generated from a published grammar (doc 03 §2.1/§2.4).
# That is C3-a: the grammar is published, L1 is written rather than trained, so these are fixtures,
# not training data, and their realism trains nothing (doc 07 §2.3).
DETECTOR_SPANS = {
    "NRIC (hyphenated)":     "890101-14-5555",
    "NRIC (bare)":           "890101145555",
    "SSM 12-digit":          "201201234567",
    "SSM with suffix":       "(201201234567-A)",
    "LHDN TIN":              "IG845462070",
    "LHDN legacy":           "SG12345678901",
    "Passport":              "A12345678",
    "EPF/KWSP (8 bare)":     "12345678",
    "Malay name":            "Nurul Aina binti Abdullah",
    "Chinese name":          "陈志明",
    "Honorific + name":      "Dato' Seri Ahmad bin Ismail",
    "Org (long)":            "Malaysian Industrial Development Finance Berhad",
}

# Doc 03 §2.3: "SSM numbers appear as 'Company No. 201201234567', '(201201234567-A)', 'Reg. No.'.
# NRICs appear as 'IC', 'NRIC', 'No. KP', 'MyKad'. A context window around the match is the
# HIGHEST-VALUE L1 RULE IN THE PRODUCT." The window is LEADING, not symmetric -- the disambiguator
# precedes the digits. That asymmetry sizes the stride's overlap on one side only.
CONTEXT_TOKENS = ["Company No.", "Reg. No.", "No. Syarikat", "IC", "NRIC", "No. KP", "MyKad",
                  "Kad Pengenalan"]

LANG_NAMES = {"en": "English", "ms": "Malay (BM)", "zh": "Chinese"}


def load_tokenizer():
    try:
        from transformers import AutoTokenizer
    except ImportError:
        sys.exit("pip install transformers sentencepiece\n"
                 "(mDeBERTa's tokenizer is SentencePiece -- doc 03 §5.)")
    try:
        return AutoTokenizer.from_pretrained(MODEL)
    except Exception as e:
        sys.exit(f"Could not load {MODEL}: {e}\n"
                 "This needs network on first run; it caches after.")


def read_corpus(root: pathlib.Path):
    corpus = {}
    for lang in ("en", "ms", "zh"):
        d = root / lang
        if not d.is_dir():
            continue
        texts = [p.read_text(encoding="utf-8", errors="replace")
                 for p in sorted(d.glob("**/*.txt"))]
        texts = [t for t in texts if t.strip()]
        if texts:
            corpus[lang] = texts
    return corpus


def cjk_ratio(s: str) -> float:
    """Sanity check: is the file labelled zh actually Chinese? A corpus mislabelled at the directory
    level would silently produce the exact ~3x ratio doc 06 §4.3 predicted, which is how a
    confirming result gets believed without being true."""
    if not s:
        return 0.0
    n = sum(1 for c in s if "一" <= c <= "鿿")
    return n / len(s)


def measure(tok, texts, lang):
    per_file = []
    total_chars = total_tokens = 0
    for t in texts:
        # Strip whitespace runs so the ratio is about the script, not about formatting.
        chars = len(unicodedata.normalize("NFC", " ".join(t.split())))
        n = len(tok.encode(t, add_special_tokens=False))
        if chars == 0:
            continue
        per_file.append(n / chars)
        total_chars += chars
        total_tokens += n
    if not per_file:
        return None
    return {
        "files": len(per_file),
        "chars": total_chars,
        "tokens": total_tokens,
        # Aggregate, not the mean of ratios -- a mean of per-file ratios weights a 3-line file the
        # same as a novel.
        "tokens_per_char": total_tokens / total_chars,
        "chars_per_token": total_chars / total_tokens,
        "per_file_spread": {
            "min": min(per_file),
            "median": statistics.median(per_file),
            "max": max(per_file),
        },
        "cjk_ratio": statistics.mean(cjk_ratio(t[:20000]) for t in texts),
    }


def main():
    ap = argparse.ArgumentParser(description="U21-a: stock-vocabulary fertility, BM/ZH vs EN.")
    ap.add_argument("--corpus", required=True, type=pathlib.Path,
                    help="dir with en/ ms/ zh/ subdirs of .txt (see README.md)")
    ap.add_argument("--paste-chars", type=int, default=5000,
                    help="paste size to report chunk counts for (doc 06 §4.3 uses 5000)")
    ap.add_argument("--json", type=pathlib.Path, help="write raw results here")
    args = ap.parse_args()

    tok = load_tokenizer()
    corpus = read_corpus(args.corpus)
    if not corpus:
        sys.exit(f"No corpus under {args.corpus}. Expected {args.corpus}/{{en,ms,zh}}/*.txt")

    print(f"\nU21-a — stock-vocabulary fertility · {MODEL}")
    print(f"vocab_size=251000 · max_position_embeddings={MAX_POSITION_EMBEDDINGS} (cited, config.json)")
    print("=" * 78)

    results = {}
    for lang, texts in corpus.items():
        m = measure(tok, texts, lang)
        if m:
            results[lang] = m

    if "zh" in results and results["zh"]["cjk_ratio"] < 0.2:
        print("\n⚠️  corpus/zh/ is <20% CJK characters. The ratio below is not measuring Chinese.\n")

    print(f"\n{'lang':<14}{'files':>6}{'chars':>12}{'tokens':>12}{'tok/char':>10}"
          f"{'char/tok':>10}{f'chunks@{args.paste_chars}':>14}")
    print("-" * 78)
    for lang, m in results.items():
        chunks = math.ceil((args.paste_chars * m["tokens_per_char"]) / MAX_POSITION_EMBEDDINGS)
        m["chunks_at_paste"] = chunks
        print(f"{LANG_NAMES.get(lang, lang):<14}{m['files']:>6}{m['chars']:>12,}"
              f"{m['tokens']:>12,}{m['tokens_per_char']:>10.3f}"
              f"{m['chars_per_token']:>10.2f}{chunks:>14}")

    # ── The claim under test ──────────────────────────────────────────────────────────────────
    # Doc 06 §4.3 estimated ~3x (EN ~0.25 tok/char, ZH ~0.8) and tagged it an ESTIMATE, with the
    # direction certain. This measures it. Do not report the estimate once you have the number.
    if "en" in results and "zh" in results:
        ratio = results["zh"]["tokens_per_char"] / results["en"]["tokens_per_char"]
        results["zh_over_en_ratio"] = ratio
        print(f"\n  ZH/EN fertility ratio = {ratio:.2f}x   (doc 06 §4.3 estimated ~3x, tagged estimate)")
        print(f"  A {args.paste_chars}-char paste: {results['en']['chunks_at_paste']} chunks EN "
              f"vs {results['zh']['chunks_at_paste']} chunks ZH  →  that multiple IS the paste-latency "
              f"penalty in the wedge's language.")

    if "ms" in results and "en" in results:
        r = results["ms"]["tokens_per_char"] / results["en"]["tokens_per_char"]
        results["ms_over_en_ratio"] = r
        print(f"  MS/EN fertility ratio = {r:.2f}x   (doc 06 §4.3: Malay is Latin-script and close to "
              f"English on this axis — its cost is morphological, not tokens-per-character)")

    # ── Doc 07 §6.2's stride, free in the same pass ───────────────────────────────────────────
    print("\n" + "=" * 78)
    print("Chunk overlap — doc 07 §6.2. Bounded by OUR detector list, not the user's text.")
    print("=" * 78)
    span_lens = {}
    segmentation = {}
    for name, sample in DETECTOR_SPANS.items():
        n = len(tok.encode(sample, add_special_tokens=False))
        pieces = tok.tokenize(sample)
        span_lens[name] = n
        segmentation[name] = pieces
        print(f"  {name:<32}{sample:<48}{n:>3} tok  {pieces}")
    results["segmentation"] = segmentation
    ctx_lens = {c: len(tok.encode(c, add_special_tokens=False)) for c in CONTEXT_TOKENS}
    print()
    for c, n in ctx_lens.items():
        print(f"  context token: {c:<24}{n:>3} tok")

    longest_span = max(span_lens.values())
    longest_ctx = max(ctx_lens.values())
    floor = longest_span + longest_ctx
    results["stride"] = {
        "longest_detector_span_tokens": longest_span,
        "longest_context_token_tokens": longest_ctx,
        "overlap_floor_tokens": floor,
        "overlap_floor_pct_of_window": floor / MAX_POSITION_EMBEDDINGS * 100,
        "note": "FLOOR, not the value. Doc 07 §6.2 decided the DIRECTION (err toward recall) and "
                "declined to invent the number. The window is LEADING, not symmetric: doc 03 §2.3's "
                "disambiguator ('Company No.') PRECEDES the digits.",
    }
    print(f"\n  longest detector span      {longest_span} tok")
    print(f"  longest context token      {longest_ctx} tok")
    print(f"  → overlap FLOOR            {floor} tok = {floor / MAX_POSITION_EMBEDDINGS * 100:.1f}% of the 512 window")
    print(f"\n  Doc 07 §6.2 claimed the overlap is 'tens of tokens, not hundreds' and tagged it an")
    print(f"  estimate. This is that estimate, measured. It is a FLOOR — a real stride wants margin.")

    print("\n" + "=" * 78)
    print("How to read this — doc 07 §3.3")
    print("=" * 78)
    print("  FAIL is FINAL.       Trimming can only RAISE fertility (doc 06 §4.4), so this is the")
    print("                       floor. If ZH chunk count already blows the paste budget, U21-b")
    print("                       cannot rescue it and doc 06 §6.2's distillation trigger has")
    print("                       fired — through its second entrance, with no memory decision.")
    print("  PASS is PROVISIONAL. U21-b (trimmed vocab) is still owed and IS corpus-blocked.")
    print("  DISTRIBUTION CAVEAT. A ratio from Wikipedia/CC100 is not a ratio from WhatsApp-register")
    print("                       Bahasa Rojak. For a RATIO that is second-order (Chinese has no")
    print("                       whitespace in either register). For the VOCABULARY PICK it is")
    print("                       first-order — which is exactly why doc 03 §4.2 blocked that and")
    print("                       not this. That distinction is the whole finding.")
    print("  NO TOKENS/SEC.       Not here, not derived, not implied. U6-b owns latency.\n")

    if args.json:
        args.json.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"  raw → {args.json}\n")


if __name__ == "__main__":
    main()
