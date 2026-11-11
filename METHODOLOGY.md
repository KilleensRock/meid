# Methodology

How the six archived Benefacts spreadsheets become the register published here, and what
is wrong with them. Every figure quoted is computed from the files, not asserted.

## Sources

| File | Rows used | Used for |
|---|---|---|
| Directory of Irish Nonprofits 2015–2021 | 20,707 | Legacy register, sector, county, identifiers, website |
| Directory of Irish Nonprofits 2022 | 20,562 | Register membership in 2022 |
| Irish Nonprofits Directory 2024 | 18,567 | Current register, legal form, address, alternative names |
| Financial dataset 2015–2021 | 70,476 | All financial figures and their provenance |
| Governance dataset 2015–2021 | 15,901 | Legal purpose and charitable objects |
| Who Funds What 2020 | 2,101 | State funding by body and programme |

All six are from the ISSDA archive of the Benefacts database, CC BY 4.0.

## Joining

Organisations are joined on `BENEFACTSID`, which is present in all six files.

The published register is the **union** of the three directories plus any organisation
that appears in the financial file alone. Dissolved and departed organisations are kept
rather than dropped, because "this organisation used to exist and filed these accounts"
is information the register should carry.

Precedence where two files disagree about the same field:

1. the 2024 directory,
2. then the 2015–2021 directory,
3. then the governance file,
4. then the financial file.

Later sources only ever fill a field the earlier ones left empty. A `reg` bitmask on each
organisation records which sources it appeared in, so the Coverage view can report churn
without re-deriving it.

## Conventions

- **Expenditure is negative.** Expenditure, creditors and other outflows carry a negative
  sign in the source. Summing income and expenditure without checking signs produces a
  surplus where there is a deficit. The line-by-line tables show figures as filed; the
  summary figures show expenditure as a positive amount and say so.
- **Surplus is income plus expenditure**, not income minus expenditure, for the same
  reason. This reconciles with the source's own net income field.
- **Nothing is imputed.** No interpolation, no estimation, no carrying a figure forward
  into a year with no accounts. A blank means the source is blank.
- **Registration numbers are text, not integers.** They are kept exactly as published.
- **Names are stored upper-cased** in the source. They are title-cased for reading, with
  a list of preserved acronyms; the registered form is kept for search and export. There
  is no mixed-case original in the archive.

## Defects found in the source files

Any other loader will meet these too.

1. **The financial data effectively ends in 2020.** The file is titled 2015–2021 but
   holds 2013–2020 in substance: 2021 carries 16 sets of accounts against roughly 9,000
   at the peak. Four years of accounts are not missing — five are.

2. **1,376 organisations have accounts but appear in no published directory.** They are
   carried here from the financial file alone, with no county, address or legal form. Any
   identifier matching has to read the financial file as well as the directories.

3. **12,732 organisations have no accounts at all** — over half the register. A
   "top 500 by income" target is therefore a target over the 11,240 with a known income,
   not over the whole register.

4. **Two rows in the governance file are malformed.** Purpose text containing newlines
   splits its row across three lines, leaving text fragments in the ID column. A loader
   must reject non-numeric IDs rather than trust the row count.

5. **Identifier formats are not uniform.** Friendly-society numbers appear as `5474 R`
   and Revenue sports numbers as `GS 139`. Parsing identifiers as integers silently
   drops them.

6. **A literal `_x000D_` precedes real newlines** in long text fields, an artifact of how
   the spreadsheets were written. It has to be stripped or it shows on screen.

7. **Row counts from spreadsheet metadata are wrong.** The 2024 directory reports 21,184
   rows but holds 18,567 organisations; the surplus is padding. Count real keys, not
   declared dimensions.

## Coverage, stated plainly

Accounts coverage is uneven and varies widely by sector — from under a fifth in some
sectors to most of the organisations in others. Field completeness within the accounts
varies too: headline income and expenditure are stated in about seven filings in ten,
while notes-level fields such as key management pay are far sparser, partly because small
companies may legitimately file abridged accounts that omit them.

For this reason the sector and year totals in the Analyse view are totals **of this
dataset**, not of the Irish nonprofit sector. The Coverage view in the application
reports all of this per sector, per year and per field, computed live from the data.

## Personal data

The published register contains organisation-level information only: names, registered
addresses, identifiers, sector classifications, stated purposes and filed financial
figures — all of it already on the public record.

The archived governance file contains no director names, no officer details and no
individual pay. Nothing of that kind is published here, and none of it is present in the
source to publish.
