#!/usr/bin/env python3
"""Build separate Cenários data, without touching existing dashboard files."""
import argparse, collections, datetime as dt, gzip, hashlib, json, re, unicodedata
from pathlib import Path
from scenario_statistics import distribution, forecast, lag_correlations


def norm(s):
    return ''.join(c for c in unicodedata.normalize('NFKD',str(s)).upper() if not unicodedata.combining(c) and c.isalnum())


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n')


def build(repo,out):
    manifest_path=repo/'data/manifest.json';manifest=json.loads(manifest_path.read_text())
    snapshot=json.loads(re.search(r'<script type="application/json" id="data-app-reviewed-snapshot">(.*?)</script>',(repo/'index.html').read_text(),re.S).group(1))
    q=snapshot['queries']; lookup=collections.defaultdict(set); shapes={}
    for path in sorted((repo/'data/geography').glob('*.json')):
        geo=json.loads(path.read_text())
        for f in geo['features']:
            lookup[(f['uf'],norm(f['name']))].add(f['code']);shapes[f['code']]={'name':f['name'],'uf':f['uf']}
    monthly=[]; municipalities=collections.defaultdict(lambda:[0,0]);sankey=collections.Counter();audits=[];input_hashes=[]
    last=manifest['coverageEnd']; year=last[:4]
    for receipt in manifest['months']:
        path=repo/'data'/receipt['originCubePath'];blob=path.read_bytes();d=json.loads(gzip.decompress(blob));cols={k:i for i,k in enumerate(d['columns'])}; dic=d['dictionaries']
        input_hashes.append({'month':receipt['month'],'file':receipt['originCubePath'],'sha256':hashlib.sha256(blob).hexdigest()})
        total=mit=all_rows=0; ytd=receipt['month'].startswith(year)
        for row in d['rows']:
            count=row[cols['count']];all_rows+=count
            if dic['segmento'][row[cols['segmento']]] not in ['Auto','Comercial Leve']:continue
            total+=count; is_mit=dic['marca'][row[cols['marca']]].strip().upper()=='MITSUBISHI';mit+=count*is_mit
            if ytd:
                uf=dic['uf'][row[cols['uf']]];city=dic['municipio'][row[cols['municipio']]];v=municipalities[(uf,city)];v[0]+=count;v[1]+=count*is_mit
                nodes=tuple(dic[k][row[cols[k]]] for k in ['bd_origem','bd_combustivel','bd_carroceria']);sankey[nodes]+=count
        expected=receipt['lightVehicleRows']
        if total!=expected:raise ValueError(f"Scope mismatch {receipt['month']}: {total} != {expected}")
        monthly.append({'month':receipt['month'],'registrations':total,'mitsubishi':mit,'mitsubishiShare':mit/total if total else None,
                        'yoy':total/monthly[-12]['registrations']-1 if len(monthly)>=12 and monthly[-12]['registrations'] else None})
        audits.append({'month':receipt['month'],'sourceRows':all_rows,'lightRows':total,'excludedRows':all_rows-total,
                       'qualityStatus':receipt['qualityStatus'],'warnings':receipt['warnings'],'sourceName':receipt['sourceName']})
    months=[r['month'] for r in monthly]
    expected=[f'{y:04}-{m:02}' for y in range(int(months[0][:4]),int(months[-1][:4])+1) for m in range(1,13) if months[0]<=f'{y:04}-{m:02}'<=months[-1]]
    if months!=expected:raise ValueError('Monthly gaps or order errors; forecasts disabled rather than filling missing months.')
    sociofile=out/'socioeconomic.json'; socioeconomic=json.loads(sociofile.read_text()) if sociofile.exists() else {'rows':[],'sources':[]}
    socio={r['code']:r for r in socioeconomic['rows']}
    rows=[];unmatched=[];matched_total=0
    for (uf,name),(n,mit) in sorted(municipalities.items()):
        codes=lookup.get((uf,norm(name)),set());code=next(iter(codes)) if len(codes)==1 else None
        row={'code':code,'uf':uf,'name':name,'registrations':n,'mitsubishi':mit,'mitsubishiShare':mit/n if n else None,'joinStatus':'matched' if code else 'ambiguous' if codes else 'unmatched'}
        ext=socio.get(code,{})
        row.update({k:ext.get(k) for k in ['population','populationYear','gdpPerCapita','gdpYear','boundaryAttention']})
        row['registrationsPer1000']=1000*n/ext['population'] if ext.get('population',0) else None
        rows.append(row)
        if code:matched_total+=n
        else:unmatched.append(row)
    frozen=q['phase2_geography_top']; sample=[]; registered={r['code']:r for r in rows if r['code']}
    for f in frozen['rows']:
        code=f['municipality_code'];r=registered.get(code);pop=f['population_estimate_2026'];gdp=f['gdp_pc_nominal_brl_2023']
        sample.append({'code':code,'name':f['municipality_name'],'uf':f['state_abbrev'],'population':pop,'populationYear':2026,'gdpPerCapita':gdp,'gdpYear':2023,
            'registrations':r['registrations'] if r else None,'registrationsPer1000':1000*r['registrations']/pop if r and pop else None,
            'mitsubishiShare':r['mitsubishiShare'] if r else None,'frozenRegistrations':f['n_2026'],'frozenReconciled':bool(r and r['registrations']==f['n_2026']),
            'populationSource':'https://sidra.ibge.gov.br/tabela/6579','gdpSource':'https://ftp.ibge.gov.br/Pib_Municipios/2022_2023/base/'})
    forecasts={k:forecast(months,[r[k] for r in monthly]) for k in ['registrations','mitsubishi']}
    for f in forecasts.values():
        if f['status']=='available':
            yy,mm=map(int,last.split('-'))
            for p in f['intervals']:
                k=yy*12+mm-1+p['horizon'];p['month']=f'{k//12:04}-{k%12+1:02}'
    macrofile=out/'external_sources.json';external=json.loads(macrofile.read_text()) if macrofile.exists() else {'status':'not_fetched','series':[]}
    lags={s['key']:lag_correlations(months,[r['registrations'] for r in monthly],{r['month']:r['value'] for r in s.get('monthly',[])},s.get('kind')=='rate') for s in external.get('series',[]) if s.get('status')=='available'}
    common={'schemaVersion':'scenarios-1.0.0','builtAt':dt.datetime.now(dt.timezone.utc).isoformat(),'sourceAsOf':manifest['generatedAt'],
            'coverageStart':months[0],'coverageEnd':months[-1],'unit':'source registration rows, duplicates retained; not unique vehicles',
            'scope':['Auto','Comercial Leve'],'filterContract':'Precomputed national monthly history and fixed January–latest-month regional sample; dashboard filters do not recompute these files.',
            'classificationVintage':'Retrospective BD classification from reviewed source snapshot, not historical as-of reconstruction.'}
    write(out/'monthly.json',{**common,'rows':monthly,'distributions':{k:distribution([r[k] for r in monthly]) for k in ['registrations','mitsubishi','yoy']},'seasonality':{str(m):distribution([r['registrations'] for r in monthly if int(r['month'][5:])==m]) for m in range(1,13)}})
    write(out/'regional.json',{**common,'period':[year+'-01',last],'municipalities':rows,'selectedSample':sample,'sampleWarning':'Only 30 municipalities preselected by frozen Phase 2 peer-gap ranking. Not a representative sample or nationwide GDP/population coverage. Never infer national distributions from it.',
        'geometry':'Use existing data/geography/{UF}.json municipality polygon paths. State-local projected SVG coordinates cannot be treated as longitude/latitude or stitched into a national 3D mesh.',
        'joinAudit':{'keys':len(rows),'matchedKeys':len(rows)-len(unmatched),'unmatchedKeys':len(unmatched),'registrationCoverage':matched_total/sum(r['registrations'] for r in rows),'unmatched':unmatched},
        'socioeconomicCoverage':socioeconomic.get('coverage'),'socioeconomicSources':socioeconomic['sources'],'distributions':{'gdpPerCapitaAllMunicipalities':distribution([r.get('gdpPerCapita') for r in socioeconomic['rows']]),'populationAllMunicipalities':distribution([r.get('population') for r in socioeconomic['rows']]),'registrationsPer1000MatchedObserved':distribution([r.get('registrationsPer1000') for r in rows])},'caveats':frozen['source']['caveats'],'sources':frozen['source']['tables'],'frozenAsOf':frozen['source']['executedAt']})
    write(out/'composition.json',{**common,'period':[year+'-01',last],'dimensions':['bd_origem','bd_combustivel','bd_carroceria'],
        'rows':[{'origin':a,'propulsion':b,'body':c,'count':n} for (a,b,c),n in sorted(sankey.items())],
        'meaning':'Composition of the same registration records across attributes. This is not customer movement, conversion, or migration.'})
    write(out/'forecasts.json',{**common,'models':forecasts,'frozenReference':{'asOf':q['phase2_context']['rows'][0]['asOf'],'metrics':q['phase2_forecast_metrics']['rows'],'source':q['phase2_forecast_metrics']['source']},
        'warning':'Frozen ETS comparison uses its original test protocol; its scores cannot be ranked against the new experiment with different folds. No macro coefficient or causal elasticity has been validated.'})
    write(out/'macro_analysis.json',{**common,'status':'available' if lags else 'blocked_external_data','lagCorrelations':lags,'simulation':{'status':'blocked','reason':'No validated two-factor exogenous model. Do not fabricate response surfaces or impacts from slider inputs.'}})
    write(out/'audit.json',{**common,'manifestSha256':hashlib.sha256(manifest_path.read_bytes()).hexdigest(),'inputCubes':input_hashes,'months':audits,'phase2Reconciliation':{'nationalTotal':sum(r['registrations'] for r in monthly),'frozenTotal':q['phase2_context']['rows'][0]['source']['analysisRows'],'selectedSampleAllMatch':all(r['frozenReconciled'] for r in sample)}})
    visual={
      'diagnostic_histogram':{'tab':'Diagnóstico','status':'available','file':'monthly.json'},
      'diagnostic_boxplot':{'tab':'Diagnóstico','status':'available','file':'monthly.json'},
      'composition_sankey':{'tab':'Diagnóstico','status':'available','file':'composition.json'},
      'macro_timeseries':{'tab':'Economia e mercado','status':'available' if lags else 'blocked','file':'external_sources.json'},
      'macro_lag_heatmap':{'tab':'Economia e mercado','status':'available' if lags else 'blocked','file':'macro_analysis.json'},
      'municipal_2d_share':{'tab':'Potencial regional','status':'available','file':'regional.json'},
      'gdp_population_scatter':{'tab':'Potencial regional','status':'available_national_matched' if socio else 'partial_selected_30','file':'regional.json'},
      'municipal_3d_per1000':{'tab':'Potencial regional','status':'available_state_local_polygons_only' if socio else 'blocked_nationwide_population_and_geographic_mesh','file':'regional.json'},
      'forecast_fan':{'tab':'Previsões','status':'exploratory_only_failed_validation','file':'forecasts.json'},
      'two_factor_3d_response':{'tab':'Simulações','status':'blocked_unvalidated_model','file':'macro_analysis.json'}}
    write(out/'manifest.json',{**common,'tabs':['Diagnóstico','Economia e mercado','Potencial regional','Previsões','Simulações'],'visuals':visual,'files':['socioeconomic.json','monthly.json','regional.json','composition.json','forecasts.json','macro_analysis.json','audit.json','external_sources.json'],
        'presentationRules':['Show source vintage, last available date, unit, scope and availability next to charts.','Never label GDP per capita as household income.','Registration location may reflect fleets, headquarters or incentives, not resident demand.','No artificial municipal point precision; use official polygons or explicitly labeled cartographic centroids.','Unavailable is not zero. Selected samples are not national coverage.']})
    print(json.dumps({'months':len(monthly),'total':sum(r['registrations'] for r in monthly),'joinCoverage':matched_total/sum(r['registrations'] for r in rows),'sampleReconciled':all(r['frozenReconciled'] for r in sample),'models':{k:v.get('selectedModel') for k,v in forecasts.items()}},indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,required=True);p.add_argument('--out',type=Path,default=Path(__file__).resolve().parents[1]/'data/scenarios');a=p.parse_args();build(a.repo,a.out)
