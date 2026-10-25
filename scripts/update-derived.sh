#!/usr/bin/env bash
# After adding a month (cube in data/cubes and data/origin-cubes + data/manifest.json),
# regenerates what derives from the data, checks everything and builds dist/.
# The quick period buttons (Ano atual, Último mês) follow the manifest on their own.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/build-history.py          # 10-year history (data/history)
python3 scripts/build-population.py       # population by UF/municipality (changes only with a new IBGE estimate)
python3 scripts/fetch_econ_extra.py       # economic series (BCB, IBGE, Ipeadata) with receipts
python3 scripts/econ_model.py             # elasticities, decomposition and simulator (data/scenarios/econ_model.json)
node tests/lib/data-baseline.cjs --update # records the new data fingerprint
npm run build                             # dist/ for Cloudflare Pages
bash scripts/test.sh                      # every test
echo "Pronto. Revise o que mudou (git status), faça commit e push para main: o Cloudflare publica sozinho."
