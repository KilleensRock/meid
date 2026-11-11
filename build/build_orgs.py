"""Build orgs.json: union register across 2015-21 legacy, 2022 and 2023/24 directories.

Register bitmask (field `reg`): 1 = in 2015-2021 legacy, 2 = in 2022, 4 = in 2023/24.
Latest-year headline financials are attached so the main table sorts without loading fin.json.
"""
import openpyxl, os, json, re

D = os.environ.get('BENEFACTS_SRC', 'source')
OUT = os.environ.get('BENEFACTS_OUT', 'data')
os.makedirs(OUT, exist_ok=True)

NUM = re.compile(r'\d+')
anomalies = []


def ident(v):
    """A registration number as published. Formats vary legitimately: RFS
    numbers like '5474 R', Revenue sports numbers like 'GS 139'."""
    if v is None:
        return None
    s = str(v).strip()
    if not s or s == 'None':
        return None
    if s.endswith('.0'):
        s = s[:-2]
    return s


def nid(v):
    """Normalise a Benefacts id. Must be numeric: two rows in the governance
    file are text spill from purpose fields that contain newlines."""
    s = ident(v)
    if s is None:
        return None
    if not NUM.fullmatch(s):
        anomalies.append(s)
        return None
    return s


def txt(v):
    if v is None:
        return ''
    s = str(v).replace('_x000D_', '').strip()
    return '' if s in ('None', 'nan') else s


orgs = {}   # id -> record


def rec(i):
    if i not in orgs:
        orgs[i] = {'id': i, 'name': '', 'alt': '', 'sub': '', 'sec': '', 'cty': '', 'gf': '',
                   'cro': '', 'rcn': '', 'chy': '', 'roll': '', 'rfs': '', 'addr': '', 'eir': '',
                   'url': '', 'inc': '', 'crost': '', 'rcnst': '', 'tax': '', 'sport': '', 'reg': 0}
    return orgs[i]


# ---- 1) legacy 2015-2021 directory ----
wb = openpyxl.load_workbook(os.path.join(D, 'Directory-of-Irish-Nonprofits-2015-2021-1.xlsx'), read_only=True)
ws = wb['Benefacts Database of Irish Non']
it = ws.iter_rows(values_only=True)
next(it)
for r in it:
    i = nid(r[0])
    if not i:
        continue
    o = rec(i)
    o['reg'] |= 1
    o['name'] = txt(r[1]) or o['name']
    o['sec'] = txt(r[2]) or o['sec']
    o['sub'] = txt(r[4]) or o['sub']
    o['cty'] = txt(r[6]) or o['cty']
    o['eir'] = txt(r[7]) or o['eir']
    o['cro'] = ident(r[8]) or o['cro']
    o['crost'] = txt(r[9]) or o['crost']
    o['rcn'] = ident(r[10]) or o['rcn']
    o['rcnst'] = txt(r[11]) or o['rcnst']
    o['chy'] = ident(r[12]) or o['chy']
    o['rfs'] = ident(r[13]) or o['rfs']
    o['url'] = txt(r[15]) or o['url']
wb.close()

# ---- 2) 2022 directory (header on row 3) ----
wb = openpyxl.load_workbook(os.path.join(D, 'Directory-of-Irish-Nonprofits-2022.xlsx'), read_only=True)
ws = wb['DirectoryofIrishNonprofits2022']
for n, r in enumerate(ws.iter_rows(values_only=True), 1):
    if n <= 3 or not r:
        continue
    i = nid(r[0])
    if not i:
        continue
    o = rec(i)
    o['reg'] |= 2
    o['name'] = txt(r[1]) or o['name']
wb.close()

# ---- 3) 2023/24 directory — the most recent register, wins on conflicts ----
wb = openpyxl.load_workbook(os.path.join(D, 'Irish-Nonprofits-Directory-2023.xlsx'), read_only=True)
ws = wb['DirectoryofIrish Nonprofits24']
it = ws.iter_rows(values_only=True)
next(it)
for r in it:
    i = nid(r[0])
    if not i:
        continue
    o = rec(i)
    o['reg'] |= 4
    o['name'] = txt(r[1]) or o['name']
    o['cro'] = ident(r[2]) or o['cro']
    o['rcn'] = ident(r[3]) or o['rcn']
    o['roll'] = ident(r[4]) or o['roll']
    o['chy'] = ident(r[5]) or o['chy']
    o['rfs'] = ident(r[6]) or o['rfs']
    o['tax'] = txt(r[7]) or o['tax']
    o['sport'] = txt(r[8]) or o['sport']
    o['gf'] = txt(r[9]) or o['gf']
    o['sec'] = txt(r[10]) or o['sec']
    o['sub'] = txt(r[12]) or o['sub']
    o['inc'] = txt(r[14])[:10] or o['inc']
    o['addr'] = txt(r[15]) or o['addr']
    o['cty'] = txt(r[16]) or o['cty']
    o['eir'] = txt(r[17]) or o['eir']
    o['alt'] = txt(r[18]) or o['alt']
wb.close()

# ---- 4) governance: sector/subsector backfill for dissolved orgs ----
wb = openpyxl.load_workbook(os.path.join(D, 'Benefacts-Irish-Nonprofits-governance-dataset-2015-2021.xlsx'), read_only=True)
ws = wb['Benefacts governance data']
it = ws.iter_rows(values_only=True)
next(it)
gov_ids = set()
for r in it:
    i = nid(r[0])
    if not i:
        continue
    gov_ids.add(i)
    o = rec(i)
    o['name'] = o['name'] or txt(r[1])
    o['cro'] = o['cro'] or ident(r[2])
    o['rcn'] = o['rcn'] or ident(r[3])
    o['chy'] = o['chy'] or ident(r[4])
    o['sec'] = o['sec'] or txt(r[5])
    o['sub'] = o['sub'] or txt(r[7])
wb.close()

# ---- 5) latest-year headline financials + per-org year span ----
wb = openpyxl.load_workbook(os.path.join(D, 'Benefacts-Irish-Nonprofits-financial-dataset-2015-2021.xlsx'), read_only=True)
ws = wb['Benefacts financial dataset']
it = ws.iter_rows(values_only=True)
hdr = list(next(it))
ix = {h: k for k, h in enumerate(hdr) if h}


def num(v):
    if v is None:
        return None
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return None


latest = {}
yrs = {}
for r in it:
    i = nid(r[0])
    if not i:
        continue
    # orgs with accounts but absent from every published directory still belong
    # in the register; the financial file carries name, sector and identifiers.
    if i not in orgs:
        o = rec(i)
        o['name'] = txt(r[1])
        o['sec'] = txt(r[ix['SECTOR_CODE']])
        o['sub'] = txt(r[ix['SUBSECTOR_CODE']])
        o['cro'] = ident(r[ix['CRO']]) or ''
        o['crost'] = txt(r[ix['CRO_STATUS']])
        o['rcn'] = ident(r[ix['RCN']]) or ''
        o['rcnst'] = txt(r[ix['RCN_STATUS']])
        o['chy'] = ident(r[ix['CHY']]) or ''
        o['rfs'] = ident(r[ix['RFS']]) or ''
    y = num(r[ix['FINANCIAL_YEAR']])
    if y is None:
        continue
    yrs.setdefault(i, []).append(y)
    prev = latest.get(i)
    if prev is None or y >= prev[0]:
        latest[i] = (y, {
            'inc': num(r[ix['IE_TIR']]), 'exp': num(r[ix['IE_TRE']]),
            'na': num(r[ix['BS_NA']]), 'fr': num(r[ix['BS_FR']]),
            'emp': num(r[ix['N_NE']]), 'pay': num(r[ix['N_P']]),
            'gov': num(r[ix['F_GOVERNMENT']]), 'ftot': num(r[ix['F_TOTAL']]),
        })
wb.close()

# ---- 6) state funding 2020 presence ----
wb = openpyxl.load_workbook(os.path.join(D, 'Benefacts-Who-Funds-What-Directory-of-State-Funding-for-Nonprofits-2020.xlsx'))
ws = wb['WhoFundsWhat 2020']
wfw_ids = set()
for n in range(6, ws.max_row + 1):
    i = nid(ws.cell(row=n, column=1).value)
    if i:
        wfw_ids.add(i)
wb.close()

# ---- emit as column arrays ----
meta = json.load(open(os.path.join(OUT, 'meta.json')))
sub_i = {s['code']: k for k, s in enumerate(meta['subsectors'])}
sec_i = {s['code']: k for k, s in enumerate(meta['sectors'])}
cty_i = {c: k for k, c in enumerate(meta['counties'])}
gf_i = {g: k for k, g in enumerate(meta['govForms'])}

keys = sorted(orgs.keys(), key=lambda i: orgs[i]['name'])

# reg bitmask: 1 legacy 2015-21 | 2 directory 2022 | 4 directory 2023/24
#              8 has accounts  | 16 has governance | 32 has 2020 state funding
CORE = ('id', 'name', 'sec', 'sub', 'cty', 'gf', 'reg', 'ly', 'linc', 'lexp',
        'lna', 'lfr', 'lemp', 'lpay', 'lgov', 'nyr', 'y0', 'y1')
EXT = ('alt', 'cro', 'rcn', 'chy', 'roll', 'rfs', 'addr', 'eir', 'url', 'inc',
       'crost', 'rcnst', 'tax', 'sport')
cols = {k: [] for k in CORE + EXT}

for i in keys:
    o = orgs[i]
    reg = o['reg']
    if i in latest:
        reg |= 8
    if i in gov_ids:
        reg |= 16
    if i in wfw_ids:
        reg |= 32
    cols['id'].append(i)
    cols['name'].append(o['name'])
    cols['sec'].append(sec_i.get(o['sec'], -1))
    cols['sub'].append(sub_i.get(o['sub'], -1))
    cols['cty'].append(cty_i.get(o['cty'], -1))
    cols['gf'].append(gf_i.get(o['gf'], -1))
    cols['reg'].append(reg)
    ly = latest.get(i)
    cols['ly'].append(ly[0] if ly else None)
    for src, dst in (('inc', 'linc'), ('exp', 'lexp'), ('na', 'lna'), ('fr', 'lfr'),
                     ('emp', 'lemp'), ('pay', 'lpay'), ('gov', 'lgov')):
        cols[dst].append(ly[1][src] if ly else None)
    yy = yrs.get(i, [])
    cols['nyr'].append(len(yy))
    cols['y0'].append(min(yy) if yy else None)
    cols['y1'].append(max(yy) if yy else None)
    cols['alt'].append(o['alt'])
    for k in ('cro', 'rcn', 'chy', 'roll', 'rfs', 'addr', 'eir', 'url', 'inc', 'crost', 'rcnst'):
        cols[k].append(o[k])
    cols['tax'].append(1 if o['tax'].lower().startswith('y') else 0)
    cols['sport'].append(1 if o['sport'].lower().startswith('y') else 0)


def sparse(arr):
    """Mostly-empty string columns ship as {index: value} to cut dead weight."""
    return {str(k): v for k, v in enumerate(arr) if v not in ('', None, 0)}


core = {'n': len(keys), 'cols': {k: cols[k] for k in CORE}}
ext = {'n': len(keys), 'cols': {k: sparse(cols[k]) for k in EXT}}
for name, obj in (('orgs-core.json', core), ('orgs-ext.json', ext)):
    p = os.path.join(OUT, name)
    json.dump(obj, open(p, 'w'), separators=(',', ':'))
    print(name, round(os.path.getsize(p) / 1e6, 2), 'MB')

#: downstream builders reference organisations by position in this ordering
json.dump(keys, open(os.path.join(OUT, '_keyorder.json'), 'w'), separators=(',', ':'))

stats = {
    'orgs': len(keys),
    'inLegacy': sum(1 for i in keys if orgs[i]['reg'] & 1),
    'in2022': sum(1 for i in keys if orgs[i]['reg'] & 2),
    'in2023': sum(1 for i in keys if orgs[i]['reg'] & 4),
    'withAccounts': sum(1 for i in keys if i in latest),
    'legacyOnly': sum(1 for i in keys if (orgs[i]['reg'] & 1) and not orgs[i]['reg'] & 4),
    'newIn2023': sum(1 for i in keys if (orgs[i]['reg'] & 4) and not orgs[i]['reg'] & 1),
    'noDirectory': sum(1 for i in keys if not orgs[i]['reg'] & 7),
    'withGovernance': len(gov_ids & set(keys)),
    'withStateFunding': len(wfw_ids & set(keys)),
    'rowAnomalies': len({a for a in set(anomalies) if len(a) < 40}),
    'anomalySamples': sorted(a for a in set(anomalies) if len(a) < 40),
}
json.dump(stats, open(os.path.join(OUT, 'stats.json'), 'w'), separators=(',', ':'))
for k, v in stats.items():
    print(' ', k, v)
