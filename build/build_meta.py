"""Build meta.json: field labels, sector/county lookups, funder programmes."""
import openpyxl, os, json, datetime, re

D = os.environ.get('BENEFACTS_SRC', 'source')
OUT = os.environ.get('BENEFACTS_OUT', 'data')
os.makedirs(OUT, exist_ok=True)

# ---- financial field dictionary (code -> label, section, depth) ----
wb = openpyxl.load_workbook(os.path.join(D, 'Benefacts-Irish-Nonprofits-financial-dataset-2015-2021.xlsx'), read_only=True)
ws = wb['Financial data dictionary']
rows = [list(r) for r in ws.iter_rows(values_only=True)]

fin_fields = {}
# header-block fields (Field name | Description) appear before the Section table
for r in rows:
    a = r[0]
    b = r[1] if len(r) > 1 else None
    if a and b and str(a).strip() not in ('Field name', 'Section') and not str(a).strip().startswith('Financial data is') \
       and not str(a).strip().startswith('Separate columns'):
        code = str(a).strip()
        if ' ' not in code and code.isupper():
            fin_fields[code] = {'code': code, 'label': str(b).strip(), 'section': 'Identity', 'depth': 0}

# the Section | CODE | Totals | Sub1..Sub4 table
for r in rows:
    if not r or not r[0]:
        continue
    sec = str(r[0]).strip()
    if sec in ('Section',) or len(r) < 3:
        continue
    code = str(r[1]).strip() if r[1] else ''
    if not code or not code.isupper() or ' ' in code:
        continue
    label, depth = None, 0
    for di in range(2, min(7, len(r))):
        if r[di] is not None and str(r[di]).strip():
            label = str(r[di]).strip()
            depth = di - 2
            break
    if label:
        secname = {'I&E': 'Income & Expenditure', 'BalanceSheet': 'Balance Sheet'}.get(sec, sec.strip())
        fin_fields[code] = {'code': code, 'label': label, 'section': secname, 'depth': depth}

# the dictionary omits a few codes present in the sheet; fill from the data header
ws2 = wb['Benefacts financial dataset']
hdr = list(next(ws2.iter_rows(min_row=1, max_row=1, values_only=True)))
for h in hdr:
    if h and h not in fin_fields:
        fin_fields[h] = {'code': h, 'label': h, 'section': 'Other', 'depth': 0}
wb.close()

ordered = [fin_fields[h] for h in hdr if h]

# ---- sector / subsector / county / governing form from the 2023 register ----
wb = openpyxl.load_workbook(os.path.join(D, 'Irish-Nonprofits-Directory-2023.xlsx'), read_only=True)
ws = wb['DirectoryofIrish Nonprofits24']
it = ws.iter_rows(values_only=True)
next(it)
sectors, subsectors, counties, gforms = {}, {}, set(), set()
for r in it:
    if not r or r[0] in (None, ''):
        continue
    if r[10] and r[11]:
        sectors[str(r[10]).strip()] = str(r[11]).strip()
    if r[12] and r[13]:
        subsectors[str(r[12]).strip()] = (str(r[13]).strip(), str(r[10]).strip() if r[10] else '')
    if r[16]:
        counties.add(str(r[16]).strip())
    if r[9]:
        gforms.add(str(r[9]).strip())
wb.close()

# legacy register adds sectors/subsectors for dissolved orgs
wb = openpyxl.load_workbook(os.path.join(D, 'Directory-of-Irish-Nonprofits-2015-2021-1.xlsx'), read_only=True)
ws = wb['Benefacts Database of Irish Non']
it = ws.iter_rows(values_only=True)
next(it)
for r in it:
    if not r or r[0] in (None, ''):
        continue
    if r[2] and r[3]:
        sectors.setdefault(str(r[2]).strip(), str(r[3]).strip())
    if r[4] and r[5]:
        subsectors.setdefault(str(r[4]).strip(), (str(r[5]).strip(), str(r[2]).strip() if r[2] else ''))
    if r[6]:
        counties.add(str(r[6]).strip())
wb.close()

# ---- funder programmes from WhoFundsWhat ----
wb = openpyxl.load_workbook(os.path.join(D, 'Benefacts-Who-Funds-What-Directory-of-State-Funding-for-Nonprofits-2020.xlsx'))
ws = wb['WhoFundsWhat 2020']
frow = [ws.cell(row=4, column=c).value for c in range(1, 66)]
hrow = [ws.cell(row=5, column=c).value for c in range(1, 66)]

# programme label lookup from the ProgrammeNames sheet
pn = wb['ProgrammeNames']
prog_label = {}          # normalised acronym -> (programme label, funder)
funder_full = {}         # continuation rows leave the funder cell blank
cur_funder = None


def norm(s):
    return ' '.join(str(s).split()).lower()


for r in pn.iter_rows(min_row=10, max_row=80, values_only=True):
    a, b, c = [(str(x).strip() if x is not None else '') for x in (r + (None, None, None))[:3]]
    if a and b and c:        # Funder | Programme | Acronym
        cur_funder = a
        prog_label[norm(c)] = (b, a)
    elif not a and b and c:  # blank funder — carried down from the row above
        prog_label[norm(c)] = (b, cur_funder)
    elif a and b and not c:  # Programme | Acronym, funder carried down
        prog_label[norm(b)] = (a, cur_funder)
wb.close()

# short header names -> the full body names used in the dictionary sheet
FUNDER_FULL = {
    'DEASP': 'Department of Employment Affairs and Social Protection',
    'TUSLA': 'Tusla — Child and Family Agency',
    'HSE': 'Health Service Executive',
    'DR&CD': 'Department of Rural and Community Development',
    'Sport Ireland': 'Sport Ireland',
    'DF&HE': 'Department of Further and Higher Education',
    'Arts Council': 'Arts Council',
    'DFA': 'Department of Foreign Affairs',
    'DOJ': 'Department of Justice',
    'Local Authorities': 'Local Authorities',
}

funders, cur = [], None
for i, (f, h) in enumerate(zip(frow, hrow)):
    fn = str(f).strip() if f else None
    hn = str(h).strip() if h else None
    if fn and fn not in ('None',):
        cur = {'name': FUNDER_FULL.get(fn, fn), 'short': fn, 'col': i,
               'flagCol': None, 'programmes': []}
        funders.append(cur)
    if not hn or hn == 'None' or cur is None:
        continue
    if hn == 'Funded':
        cur['flagCol'] = i
    elif cur['short'] not in ('Companies Registration Office', 'Charities Regulatory Authority',
                              'Revenue Charity Relief'):
        bare = re.sub(r'\s*20\d\d\s*$', '', hn).strip()
        hit = prog_label.get(norm(hn)) or prog_label.get(norm(bare))
        # fall back to the acronym with its year suffix dropped
        lbl = hit[0] if hit else re.sub(r'\s*20\d\d\s*$', '', hn).strip() or hn
        cur['programmes'].append({'col': i, 'acr': hn, 'label': lbl})

funders = [f for f in funders if f['programmes']]

meta = {
    'generated': datetime.date.today().isoformat(),
    'finFields': ordered,
    'sectors': [{'code': k, 'name': v} for k, v in sorted(sectors.items(), key=lambda x: float(x[0]))],
    'subsectors': [{'code': k, 'name': v[0], 'sector': v[1]} for k, v in sorted(subsectors.items(), key=lambda x: float(x[0]))],
    'counties': sorted(counties),
    'govForms': sorted(gforms),
    'funders': funders,
}
json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), separators=(',', ':'))
print('finFields', len(ordered), '| sectors', len(sectors), '| subsectors', len(subsectors),
      '| counties', len(counties), '| govForms', len(gforms), '| funders', len(funders),
      '| programmes', sum(len(f['programmes']) for f in funders))
print('sample fields:', [(f['code'], f['label'][:30], f['section'], f['depth']) for f in ordered[24:28]])
