def read_py():
    d = {}
    with open('test_tfidf.out', encoding='utf-16le') as f:
        for line in f:
            if ':' not in line: continue
            first = line.split()[0].replace('\ufeff', '')
            k = int(first)
            tfidf = float(line.split('tfidf=')[1].split()[0])
            d[k] = tfidf
    return d

def read_js():
    d = {}
    with open('test_vite_diff.out', encoding='utf-16le') as f:
        for line in f:
            if ':' not in line: continue
            first = line.split(':')[0].replace('\ufeff', '')
            k = int(first)
            tfidf = float(line.split('tfidf=')[1].split()[0])
            d[k] = tfidf
    return d

py = read_py()
js = read_js()
for k in py:
    if k not in js:
        print(f"Missing in JS: {k}")
    elif abs(py[k] - js[k]) > 0.0001:
        print(f"Diff at {k}: PY {py[k]} vs JS {js[k]}")

for k in js:
    if k not in py:
        print(f"Extra in JS: {k}")
