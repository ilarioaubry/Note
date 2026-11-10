"""Convertit Lexique383.txt (www.lexique.org, CC BY-SA 4.0) en data/lexique.json : { "mot": "phonétique" } trié par fréquence.

Usage : python3 tools/build_lexique.py Lexique383.txt data/lexique.json
Le fichier source est en Windows-1252. Pour homographes, on garde la prononciation la plus fréquente
(films + livres). Penser à incrémenter VERSION dans sw.js après régénération.
"""
import csv, json, sys, collections
src = sys.argv[1]; out = sys.argv[2]
best = {}
chars = collections.Counter()
with open(src, encoding='cp1252', errors='replace', newline='') as f:
    r = csv.reader(f, delimiter='\t')
    h = next(r)
    i = {k.split('_',1)[1]: n for n, k in enumerate(h)}
    for row in r:
        o = row[i['ortho']].strip().lower(); p = row[i['phon']].strip()
        if not o or not p or ' ' in o or '-' in p or o[0].isdigit(): continue
        fr = lambda k: float(row[i[k]].replace(',', '.') or 0)
        f_ = fr('freqfilms2') + fr('freqlivres')
        if o not in best or f_ > best[o][0]:
            best[o] = (f_, p)
for o, (f_, p) in best.items(): chars.update(p)
items = sorted(best.items(), key=lambda kv: -kv[1][0])
print(len(items), 'orthos;', sum(1 for _, (f_, _) in items if f_ == 0), 'zero-freq', file=sys.stderr)
print(''.join(sorted(chars)), file=sys.stderr)
d = {o: p for o, (f_, p) in items}
json.dump(d, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
