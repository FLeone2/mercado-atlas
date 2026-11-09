#!/usr/bin/env bash
# After adding a month (cube in data/cubes and data/origin-cubes + data/manifest.json),
# regenerates what derives from the data, checks everything and builds dist/.
# The quick period buttons (Ano atual, Último mês) follow the manifest on their own.
set -euo pipefail
cd "$(dirname "$0")/.."
# Selic, dólar e crédito do BCB (external_sources.json), lidos pelos cenários e pelas projeções abaixo:
# o arquivo só é trocado quando todas as séries chegam; senão fica a versão anterior verificada.
if python3 scripts/fetch_scenario_sources.py --out data/scenarios/external_sources.json.new && python3 - <<'PY'
import json, sys
d = json.load(open('data/scenarios/external_sources.json.new'))
sys.exit(0 if d.get('series') and all(s.get('status') == 'available' and s.get('monthly') for s in d['series']) else 1)
PY
then mv data/scenarios/external_sources.json.new data/scenarios/external_sources.json
else rm -f data/scenarios/external_sources.json.new; echo 'Fontes do BCB indisponíveis; mantendo external_sources.json anterior.'
fi
python3 scripts/build-history.py          # 10-year history (data/history)
python3 scripts/build_scenarios.py --repo . # monthly, regional and composition from the same cubes
python3 scripts/relink_regional.py        # shared municipality-name rules
python3 scripts/phase2_regional.py         # geographic metrics and scope audit
python3 scripts/phase23_models.py --repo . # national and regional models
python3 scripts/phase3_hierarchy.py --repo . # UF/brand forecasts and source conservation
python3 scripts/phase3_spatial.py          # reuse verified geometry; refresh diagnostics
python3 scripts/refresh_scenario_receipts.py # hashes of regenerated scenario artifacts
python3 scripts/build-population.py       # population by UF/municipality (changes only with a new IBGE estimate)
if ! python3 scripts/fetch_econ_extra.py; then # retain verified prior vintage if public APIs fail
python3 - <<'PY'
import json
from pathlib import Path
path = Path('data/scenarios/econ_extra.json')
data = json.loads(path.read_text())
series = data.get('series', [])
if not data.get('retrievedAt') or len(series) != 17 or any(
    s.get('status') != 'available' or not s.get('monthly') or not s.get('receipts') or any(
        not r.get('sha256') or not r.get('url', '').startswith('https://') for r in s['receipts']
    ) for s in series
):
    raise SystemExit('No complete verified economic vintage is available; stopping.')
print('Economic refresh unavailable; retaining verified vintage:', data['retrievedAt'])
PY
fi
python3 scripts/econ_model.py             # elasticities, decomposition and simulator (data/scenarios/econ_model.json)
node tests/lib/data-baseline.cjs --update # records the new data fingerprint
npm run build                             # dist/ for Cloudflare Pages
bash scripts/test.sh                      # every test
echo "Pronto. Revise o que mudou (git status), faça commit e push para main: o Cloudflare publica sozinho."
