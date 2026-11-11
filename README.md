# Méid — the public record of Irish nonprofits

A free, searchable front end over the archived **Benefacts Database of Irish Nonprofits**.

*Méid* is the Irish for amount or extent — the word inside the question *cé mhéad?*, how much.
That is what this register answers: how much an organisation raised, how much it spent, and
how much of it came from the State. The project is independent of Benefacts and uses a name
of its own.

Benefacts published an open database of Irish non-profit organisations until it closed
in 2022, when its lead State funder withdrew support. The data was archived by the Irish
Social Science Data Archive (ISSDA) under a Creative Commons Attribution 4.0 licence.
This project puts that archive back in front of the people who used it — journalists,
researchers, funders and charity staff — and sets out plainly what it does and does not
cover.

**It is a historic snapshot, not a live register.** The directory ends in 2024 and the
financial data ends, in substance, in 2020. For the current status of an organisation,
check the [Charities Regulator](https://www.charitiesregulator.ie/) or the
[Companies Registration Office](https://core.cro.ie/) directly.

## What it holds

| | |
|---|---|
| Organisations | 23,972 |
| In the 2024 directory | 18,567 |
| With at least one set of accounts | 11,240 |
| Sets of accounts (organisation-years) | 70,476 |
| Financial fields per set of accounts | 182 |
| With a stated legal purpose or charitable objects | 15,901 |
| In the 2020 *Who Funds What* state funding directory | 2,101 |
| Financial years covered | 2013–2020 (2021 holds 16 filings only) |

## How it works

There is no database server and no backend. The whole thing is static files: one HTML
page and a set of JSON data files. The query engine — search, faceted filtering,
numeric filters, sorting, aggregation — runs in the visitor's browser.

That makes it free to host, fast, and impossible to break with a traffic spike. It also
means the data is there for anyone to take: every file under `data/` is fetchable
directly.

Loading is progressive, so the page is usable in well under a second:

| Stage | Files | Transferred |
|---|---|---|
| First paint | `meta`, `stats`, `orgs-core` | ~580 KB |
| Background | `fin`, `orgs-ext`, `funding2020` | ~2.6 MB |
| On demand, per organisation | one `detail/` and one `gov/` bucket | ~60–90 KB |

### A deliberate quirk worth knowing

The files under `data/` are **gzip-compressed but named `.json`**. This is intentional:
it keeps the published payload at 18 MB instead of 83 MB, and it works on static hosts
like GitHub Pages that cannot set a `Content-Encoding` header per file.

The loader in `index.html` sniffs the gzip magic bytes (`1f 8b`) and inflates when
needed, so it works whether or not the host has already decompressed the response.
Both paths are tested. **Please do not "fix" the extensions** without also changing the
loader and the host configuration.

## Layout

```
index.html          the whole application (single file, no dependencies)
data/
  meta.json         field dictionary, sector/county/funder lookups
  stats.json        headline counts used by the Coverage view
  orgs-core.json    the register: name, sector, county, latest-year figures
  orgs-ext.json     identifiers, addresses, alternative names, websites
  fin.json          headline figures for all 70,476 organisation-years
  funding2020.json  state funding by body and programme
  detail/NN.json    all 182 line items, bucketed by the last 2 digits of the id
  gov/NN.json       legal purpose and charitable objects, same bucketing
src/                the application, split into readable parts
build/              the scripts that turn the ISSDA spreadsheets into data/
```

## Rebuilding from source

The source spreadsheets are not in this repository — they are already archived at the
canonical location and total about 48 MB. Download the six files from
[ISSDA](https://www.ucd.ie/issda/data/benefacts), put them in a folder, point the build
scripts at it, and run:

```sh
pip install openpyxl
sh build/all.sh
```

`build/all.sh` rebuilds every file under `data/` and reassembles `index.html` from
`src/`. It is deterministic: the same inputs give the same outputs.

## Method, in brief

Organisations are joined on the Benefacts ID across all six source files. The most
recent directory wins where fields conflict; older directories and the governance and
financial files backfill anything missing. No figure is imputed, interpolated or
estimated — a blank means the source is blank.

`METHODOLOGY.md` sets out the joining rules, the sign conventions, and seven defects
found in the source files that any other loader will also have to handle.

## Licence and attribution

The **data** is the Benefacts Database of Irish Nonprofits, archived by ISSDA and
published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credit is due
to Benefacts and to ISSDA, and any reuse of the data must carry that attribution.

The **code** in this repository is released under the MIT licence (see `LICENSE`), so the
work survives any change in the team.

This project is not affiliated with Benefacts, ISSDA, or any State body.
