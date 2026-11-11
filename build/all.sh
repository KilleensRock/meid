#!/bin/sh
# Rebuild data/ from the ISSDA spreadsheets, then reassemble index.html from src/.
#
#   BENEFACTS_SRC  folder holding the six .xlsx files   (default: ./source)
#   BENEFACTS_OUT  folder to write the data files to    (default: ./data)
#
# Requires: python3 with openpyxl (pip install openpyxl)
set -e
cd "$(dirname "$0")/.."

SRC="${BENEFACTS_SRC:-source}"
OUT="${BENEFACTS_OUT:-data}"
export BENEFACTS_SRC="$SRC" BENEFACTS_OUT="$OUT"

if [ ! -d "$SRC" ]; then
  echo "Source folder '$SRC' not found." >&2
  echo "Download the six spreadsheets from https://www.ucd.ie/issda/data/benefacts" >&2
  echo "into that folder, or set BENEFACTS_SRC to where they are." >&2
  exit 1
fi

rm -rf "$OUT"
python3 build/build_meta.py
python3 build/build_orgs.py
python3 build/build_fin.py
python3 build/gzip_data.py
rm -f "$OUT/_keyorder.json"

# Data files are gzip bytes served under .json names; the loader in index.html
# sniffs the gzip magic bytes and inflates when the host has not already.
find "$OUT" -name '*.json.gz' -exec sh -c 'mv "$1" "${1%.gz}"' _ {} \;

# The updates layer stays plain, readable JSON: a volunteer should be able to
# open it and add a year by hand. It is not generated from the archive.
cp -f data-src/updates.json "$OUT/updates.json"

cat src/01-head.html src/02-data.js src/03-charts.js src/04-explore.js \
    src/05-org.js src/06-analyse.js src/07-coverage.js src/08-router.js > index.html

echo "index.html $(wc -c < index.html) bytes | $OUT $(du -sh "$OUT" | cut -f1) | $(find "$OUT" -type f | wc -l) files"
