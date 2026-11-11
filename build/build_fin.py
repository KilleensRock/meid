"""Build the financial layer.

fin.json          headline figures per org-year  -> charts, ranking, aggregates
detail/NN.json    all 182 fields, sparse, bucketed by last 2 digits of the id
gov/NN.json       legal purpose + charitable objects text, same bucketing
funding2020.json  WhoFundsWhat state funding matrix
"""
import openpyxl, os, json
from collections import defaultdict

D = os.environ.get('BENEFACTS_SRC', 'source')
OUT = os.environ.get('BENEFACTS_OUT', 'data')
os.makedirs(os.path.join(OUT, 'detail'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'gov'), exist_ok=True)

keys = json.load(open(os.path.join(OUT, '_keyorder.json')))
oi = {k: n for n, k in enumerate(keys)}
meta = json.load(open(os.path.join(OUT, 'meta.json')))


def nid(v):
    if v is None:
        return None
    s = str(v).strip()
    if s.endswith('.0'):
        s = s[:-2]
    return s or None


def num(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return int(round(f))


def bucket(i):
    return i[-2:].zfill(2)


# ---------------- financial dataset ----------------
wb = openpyxl.load_workbook(os.path.join(D, 'Benefacts-Irish-Nonprofits-financial-dataset-2015-2021.xlsx'), read_only=True)
ws = wb['Benefacts financial dataset']
it = ws.iter_rows(values_only=True)
hdr = [h for h in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))]
next(it)
ix = {h: n for n, h in enumerate(hdr) if h}

#: headline measures the app can rank, chart and aggregate on without
#: opening a detail bucket. Everything else lives in detail/.
HEAD = [('inc', 'IE_TIR'), ('exp', 'IE_TRE'), ('na', 'BS_NA'), ('fr', 'BS_FR'),
        ('emp', 'N_NE'), ('pay', 'N_P'), ('gov', 'F_GOVERNMENT'),
        ('ngov', 'F_NONGOV'), ('ftot', 'F_TOTAL'), ('vol', 'N_NE_NV'),
        ('kmp', 'N_KMP'), ('don', 'IE_VI'), ('grants', 'IE_IRCA_G'),
        ('cash', 'BS_CA_CABIH')]
SRC = ['CRO', 'RFS', 'OIR', 'SIPO', 'SELF']
# fields carried in the detail bucket but not in the headline table
NUMERIC = [h for h in hdr if h and h not in ('BENEFACTSID', 'REGISTERED_NAME', 'FINANCIAL_YEAR',
           'SECTOR_CODE', 'SECTOR', 'SUBSECTOR_CODE', 'SUBSECTOR', 'MULTIPLE_ACCOUNTS_IN_YEAR',
           'YEAR_END_DATE', 'ACCOUNTING_PERIOD', 'SORP', 'ABRIDGED', 'ACCOUNTS_SOURCE', 'S38',
           'HEA', 'AUDITED', 'REPORTING_STANDARD', 'CRO', 'CRO_STATUS', 'RCN', 'RCN_STATUS',
           'CHY', 'RFS')]

fin = {k: [] for k in ('oi', 'yr', 'src', 'flags')}
for k, _ in HEAD:
    fin[k] = []
detail = defaultdict(lambda: defaultdict(list))
unmatched = 0
rows = 0

for r in it:
    i = nid(r[0])
    if not i:
        continue
    k = oi.get(i)
    if k is None:
        unmatched += 1
        continue
    y = num(r[ix['FINANCIAL_YEAR']])
    if y is None:
        continue
    rows += 1
    fin['oi'].append(k)
    fin['yr'].append(y)
    s = str(r[ix['ACCOUNTS_SOURCE']] or '').strip()
    fin['src'].append(SRC.index(s) if s in SRC else -1)
    # flags packed into one int: 1 SORP, 2 abridged, 4 HSE s.38, 8 HEA-funded,
    # 16 multiple accounts in year, 32 audited, 64 audit status known
    fl = 0
    for bit, col in ((1, 'SORP'), (2, 'ABRIDGED'), (4, 'S38'), (8, 'HEA')):
        if str(r[ix[col]] or '').strip().upper() == 'Y':
            fl |= bit
    if str(r[ix['MULTIPLE_ACCOUNTS_IN_YEAR']] or '').strip().upper() == 'Y':
        fl |= 16
    av = str(r[ix['AUDITED']] or '').strip().lower()
    if av in ('true', 'y', 'yes'):
        fl |= 32 | 64
    elif av in ('false', 'n', 'no'):
        fl |= 64
    fin['flags'].append(fl)
    for key, col in HEAD:
        fin[key].append(num(r[ix[col]]))

    # full detail: keep only populated, non-zero values
    d = {'y': y, 'fl': fl}
    ed = r[ix['YEAR_END_DATE']]
    if ed:
        d['e'] = str(ed)[:10]
    if s:
        d['sr'] = s
    ap = r[ix['ACCOUNTING_PERIOD']]
    if ap:
        d['ap'] = str(ap)[:20]
    for col in NUMERIC:
        v = num(r[ix[col]])
        if v not in (None, 0):
            d[col] = v
    rs = r[ix['REPORTING_STANDARD']]
    if rs:
        d['rs'] = str(rs)[:40]
    detail[bucket(i)][i].append(d)
wb.close()

p = os.path.join(OUT, 'fin.json')
json.dump({'n': rows, 'cols': fin}, open(p, 'w'), separators=(',', ':'))
print('fin.json', rows, 'org-years |', round(os.path.getsize(p) / 1e6, 2), 'MB | unmatched', unmatched)

tot = 0
for b, orgs in detail.items():
    pb = os.path.join(OUT, 'detail', b + '.json')
    json.dump(orgs, open(pb, 'w'), separators=(',', ':'))
    tot += os.path.getsize(pb)
print('detail/', len(detail), 'buckets |', round(tot / 1e6, 2), 'MB total |',
      round(tot / max(len(detail), 1) / 1e3), 'KB avg')

# ---------------- governance text ----------------
wb = openpyxl.load_workbook(os.path.join(D, 'Benefacts-Irish-Nonprofits-governance-dataset-2015-2021.xlsx'), read_only=True)
ws = wb['Benefacts governance data']
it = ws.iter_rows(values_only=True)
next(it)
gov = defaultdict(dict)
ng = 0
for r in it:
    i = nid(r[0])
    if not i or i not in oi:
        continue
    # the source carries a literal _x000D_ before real newlines
    lp = str(r[9]).replace('_x000D_', '').strip() if r[9] else ''
    co = str(r[10]).replace('_x000D_', '').strip() if len(r) > 10 and r[10] else ''
    if not lp and not co:
        continue
    e = {}
    if lp and lp != 'None':
        e['lp'] = lp
    if co and co != 'None':
        e['co'] = co
    if e:
        gov[bucket(i)][i] = e
        ng += 1
wb.close()

tot = 0
for b, d in gov.items():
    pb = os.path.join(OUT, 'gov', b + '.json')
    json.dump(d, open(pb, 'w'), separators=(',', ':'))
    tot += os.path.getsize(pb)
print('gov/', ng, 'orgs with purpose text |', round(tot / 1e6, 2), 'MB')

# ---------------- state funding 2020 ----------------
wb = openpyxl.load_workbook(os.path.join(D, 'Benefacts-Who-Funds-What-Directory-of-State-Funding-for-Nonprofits-2020.xlsx'))
ws = wb['WhoFundsWhat 2020']
funders = meta['funders']
wfw = {}
for n in range(6, ws.max_row + 1):
    i = nid(ws.cell(row=n, column=1).value)
    if not i or i not in oi:
        continue
    rec = {}
    for f in funders:
        progs = {}
        for pr in f['programmes']:
            v = num(ws.cell(row=n, column=pr['col'] + 1).value)
            if v:
                progs[pr['acr']] = v
        flag = ws.cell(row=n, column=(f['flagCol'] or 0) + 1).value if f['flagCol'] is not None else None
        funded = str(flag or '').strip().lower() == 'yes'
        if progs or funded:
            rec[f['name']] = {'funded': funded, 'p': progs,
                              'total': sum(progs.values()) if progs else None}
    if rec:
        wfw[i] = rec
wb.close()

p = os.path.join(OUT, 'funding2020.json')
json.dump(wfw, open(p, 'w'), separators=(',', ':'))
print('funding2020.json', len(wfw), 'orgs |', round(os.path.getsize(p) / 1e6, 2), 'MB')
