#!/usr/bin/env python3
"""Build the Local view's data and its downloadable exports.

Reads   data-src/updates.json      post-archive figures (Charities Regulator returns)
        build/local_groups.json    which organisations count, their group and scope
        data/orgs-core.json        county of each organisation's registered address
        data/meta.json             county code list
Writes  data/local.json                       read by the Local page
        data/exports/local-charities.csv      one row per organisation, latest return
        data/exports/local-by-county.csv      county totals, with funding per person

Run from the repository root:  python3 build/build_local.py
"""
import csv, gzip, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)

# Census of Population 2022, final results (CSO, 30 May 2023), by county.
POP = {
    'Carlow': 61968, 'Cavan': 81704, 'Clare': 127938, 'Cork': 584156, 'Donegal': 167084,
    'Dublin': 1458154, 'Galway': 277737, 'Kerry': 156458, 'Kildare': 247774, 'Kilkenny': 104160,
    'Laois': 91877, 'Leitrim': 35199, 'Limerick': 209536, 'Longford': 46751, 'Louth': 139703,
    'Mayo': 137970, 'Meath': 220826, 'Monaghan': 65288, 'Offaly': 83150, 'Roscommon': 70259,
    'Sligo': 70198, 'Tipperary': 167895, 'Waterford': 127363, 'Westmeath': 96221,
    'Wexford': 163919, 'Wicklow': 155851,
}
assert sum(POP.values()) == 5149139, 'county populations must sum to the Census 2022 total'

GROUPS = ['Local development company', 'Approved housing body', 'Traveller organisation',
          'Homeless and addiction services', 'Integration and anti-racism']


def load(path):
    raw = open(path, 'rb').read()
    try:
        return json.loads(gzip.decompress(raw))
    except OSError:
        return json.loads(raw)


def county_name(raw):
    if not raw:
        return None
    s = raw.strip().upper()
    if s.startswith('DUBL'):
        return 'Dublin'
    if s == 'DORK':
        return 'Cork'
    s = s.title()
    return s if s in POP else None


def main():
    core = load(P('data', 'orgs-core.json'))['cols']
    meta = load(P('data', 'meta.json'))
    updates = json.load(open(P('data-src', 'updates.json'), encoding='utf-8'))
    groups = json.load(open(P('build', 'local_groups.json'), encoding='utf-8'))['orgs']
    src = updates['_sources']['cra-ar']
    index = {str(i): n for n, i in enumerate(core['id'])}

    rows, problems = [], []
    for oid, g in groups.items():
        u = updates.get(oid)
        if not u or not u.get('years'):
            problems.append(f'{oid}: no post-archive years in updates.json')
            continue
        n = index.get(oid)
        ci = core['cty'][n] if n is not None else -1
        county = county_name(meta['counties'][ci]) if ci >= 0 else None
        if not county:
            problems.append(f'{oid}: no county')
        y = u['years'][-1]
        notes = [t for t in (u.get('notes') or []) if not re.fullmatch(r'[A-Z][a-z ]+\.', t)]
        rows.append({
            'id': oid, 'rcn': g['rcn'], 'name': g['name'], 'group': g['group'],
            'county': county, 'scope': 'National' if g['national'] else 'County',
            'year': y['y'], 'income': y.get('inc'), 'state': y.get('gov'), 'donations': y.get('don'),
            'spending': None if y.get('exp') is None else -y['exp'], 'surplus': y.get('surplus'),
            'netAssets': y.get('na'), 'staff': y.get('emp'), 'note': ' '.join(notes) or None,
        })
    if problems:
        sys.exit('build_local: ' + '; '.join(problems))

    rows.sort(key=lambda r: (GROUPS.index(r['group']), -(r['income'] or 0)))

    # County totals cover county-scope organisations only; national bodies are shown apart.
    counties = []
    for c in sorted(POP):
        rs = [r for r in rows if r['county'] == c and r['scope'] == 'County']
        inc = sum(r['income'] or 0 for r in rs)
        st = sum(r['state'] or 0 for r in rs)
        counties.append({
            'county': c, 'population': POP[c], 'organisations': len(rs),
            'byGroup': {gname: sum(1 for r in rs if r['group'] == gname) for gname in GROUPS},
            'income': inc, 'state': st, 'staff': sum(r['staff'] or 0 for r in rs),
            'statePerPerson': round(st / POP[c], 2),
        })

    out = {
        'generated': updates['_sources']['cra-ar'].get('retrieved'),
        'source': {'name': src['name'], 'url': src['url'], 'effective': src.get('effective')},
        'population': {'name': 'CSO Census of Population 2022', 'total': sum(POP.values())},
        'groups': GROUPS, 'rows': rows, 'counties': counties,
    }
    with open(P('data', 'local.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))

    os.makedirs(P('data', 'exports'), exist_ok=True)
    cols = ['group', 'name', 'county', 'scope', 'year', 'income', 'state', 'donations', 'spending',
            'surplus', 'netAssets', 'staff', 'rcn', 'id', 'note']
    heads = ['Group', 'Charity', 'County (registered address)', 'Scope', 'Year', 'Income (EUR)',
             'State funding (EUR)', 'Donations (EUR)', 'Spending (EUR)', 'Surplus (EUR)',
             'Net assets (EUR)', 'Staff (FT+PT)', 'RCN', 'Meid ID', 'Note']
    with open(P('data', 'exports', 'local-charities.csv'), 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f)
        w.writerow(heads)
        for r in rows:
            w.writerow(['' if r[c] is None else r[c] for c in cols])
    with open(P('data', 'exports', 'local-by-county.csv'), 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f)
        w.writerow(['County', 'Population (Census 2022)', 'Organisations (county scope)'] + GROUPS +
                   ['Income (EUR)', 'State funding (EUR)', 'State funding per person (EUR)', 'Staff'])
        for c in counties:
            w.writerow([c['county'], c['population'], c['organisations']] +
                       [c['byGroup'][g] for g in GROUPS] +
                       [c['income'], c['state'], c['statePerPerson'], c['staff']])
    print(f'local.json: {len(rows)} organisations, '
          f'{sum(1 for r in rows if r["scope"] == "National")} national; exports written')


if __name__ == '__main__':
    main()
