#!/bin/sh
# Reassemble index.html from src/ without touching data/.
# Use this after editing the application; it needs no source spreadsheets.
# build/all.sh runs the same step at the end of a full data rebuild.
set -e
cd "$(dirname "$0")/.."
cat src/01-head.html src/02-data.js src/03-charts.js src/04-explore.js \
    src/05-org.js src/06-analyse.js src/07-coverage.js src/08-router.js > index.html
echo "index.html $(wc -c < index.html) bytes"
