#!/usr/bin/env python3
"""Fetch official public APIs with auditable receipts. Fail closed; no imputation."""
import argparse, collections, concurrent.futures, datetime as dt, hashlib, json, urllib.request, urllib.parse
from pathlib import Path

SERIES=[
 {'key':'selic_effective_month','id':4390,'label':'Selic efetiva acumulada no mês','unit':'% a.m.','frequency':'monthly','kind':'rate','aggregation':'published monthly value','metadataVerified':True,'metadataUrl':'https://dadosabertos.bcb.gov.br/pt_PT/dataset/4390-taxa-de-juros---selic-acumulada-no-mes'},
 {'key':'selic_target','id':432,'label':'Meta Selic definida pelo Copom','unit':'% a.a.','frequency':'daily','kind':'rate','aggregation':'last published observation of each completed month','metadataVerified':True,'metadataUrl':'https://bcb.gov.br/controleinflacao/historicotaxasjuros'},
 {'key':'vehicle_financing_rate','id':25471,'label':'Juros de novas operações livres PF para aquisição de veículos','unit':'% a.m.','frequency':'monthly','kind':'rate','aggregation':'published monthly weighted rate','metadataVerified':True,'metadataUrl':'https://dadosabertos.bcb.gov.br/gl/dataset/25471-taxa-media-mensal-de-juros-das-operacoes-de-credito-com-recursos-livres---pessoas-fisicas---a'},
 {'key':'vehicle_credit_concessions','id':20673,'label':'Concessões livres PF para aquisição de veículos','unit':'R$ milhões correntes','frequency':'monthly','kind':'level','aggregation':'published monthly flow; not credit stock','metadataVerified':True,'metadataUrl':'https://dadosabertos.bcb.gov.br/en/dataset/20673-concessoes-de-credito-com-recursos-livres---pessoas-fisicas---aquisicao-de-veiculos'},
 {'key':'usd_sale','id':1,'label':'Dólar PTAX venda — média mensal das observações diárias','unit':'BRL/USD','frequency':'daily','kind':'level','aggregation':'arithmetic mean of published daily observations in completed month','metadataVerified':True,'metadataUrl':'https://dadosabertos.bcb.gov.br/dataset/1-taxa-de-cambio---livre---dolar-americano-venda---diario','note':'PTAX closing sale observations identified in official SGS catalog; monthly arithmetic mean over published days, BRL/USD in 2016 onward coverage.'}
]


def get(url,timeout):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'MercadoAutomotivoSourceAudit/1.0'}),timeout=timeout) as response:
        raw=response.read();return json.loads(raw),hashlib.sha256(raw).hexdigest()


def fetch_series(s,start,end,timeout):
    result=dict(s);result.update(retrievedAt=dt.datetime.now(dt.timezone.utc).isoformat(),requestedStart=start,requestedEnd=end,lastAvailable=None,monthly=[],receipts=[])
    try:
        data=[]
        # One-year chunks also respect BCB's maximum interval for daily series.
        for year in range(int(start[:4]),int(end[:4])+1):
            a=max(start,f'{year}-01-01'); b=min(end,f'{year}-12-31')
            fmt=lambda x:dt.date.fromisoformat(x).strftime('%d/%m/%Y')
            url=f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{s['id']}/dados?"+urllib.parse.urlencode({'formato':'json','dataInicial':fmt(a),'dataFinal':fmt(b)})
            try:
                rows,sha=get(url,timeout)
            except Exception:
                rows,sha=get(url,max(timeout,20))
            if not isinstance(rows,list):raise ValueError('API did not return an observation array')
            data.extend(rows);result['receipts'].append({'url':url,'sha256':sha,'rows':len(rows)})
        unique={}
        for row in data:
            day=dt.datetime.strptime(row['data'],'%d/%m/%Y').date().isoformat();val=float(row['valor'])
            if day in unique and unique[day]!=val:raise ValueError('Conflicting duplicate observation')
            unique[day]=val
        grouped=collections.defaultdict(list)
        for day,value in sorted(unique.items()):grouped[day[:7]].append((day,value))
        current=dt.date.fromisoformat(end).strftime('%Y-%m')
        for month,obs in sorted(grouped.items()):
            # Exclude running calendar month. Monthly publication completeness is not fabricated.
            if month>=current:continue
            val=obs[-1][1] if s['frequency']=='monthly' or s['id']==432 else sum(v for _,v in obs)/len(obs)
            result['monthly'].append({'month':month,'value':val,'observations':len(obs),'lastObservation':obs[-1][0]})
        result['lastAvailable']=max(unique) if unique else None
        result['lastCompleteMonth']=result['monthly'][-1]['month'] if result['monthly'] else None
        result['status']='available' if result['monthly'] and s['metadataVerified'] else 'pending_metadata' if result['monthly'] else 'no_observations'
        result['missingMonths']=[f'{y}-{m:02}' for y in range(int(start[:4]),int(end[:4])+1) for m in range(1,13) if start[:7]<=f'{y}-{m:02}'<current and f'{y}-{m:02}' not in grouped]
        result['vintage']='Current API vintage; revisions may exist. No historical release calendar provided.'
    except Exception as e:result.update(status='blocked_fetch',error=f'{type(e).__name__}: {e}',monthly=[],lastAvailable=None)
    return result


def main(out,start,end,timeout):
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        series=list(pool.map(lambda s:fetch_series(s,start,end,timeout),SERIES))
    ibge=[]
    for table in [6579,5938]:
        url=f'https://servicodados.ibge.gov.br/api/v3/agregados/{table}/metadados'
        r={'table':table,'metadataUrl':url,'status':'pending','purpose':'population' if table==6579 else 'municipal GDP','lastAvailable':None}
        try:
            data,sha=get(url,timeout);r.update(status='metadata_fetched_data_pending',metadata=data,sha256=sha)
        except Exception as e:r.update(status='blocked_fetch',error=f'{type(e).__name__}: {e}')
        ibge.append(r)
    payload={'schemaVersion':'scenarios-sources-1.0.0','retrievedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'series':series,'ibge':ibge,
       'rules':['No filling missing dates.','Selic accumulated monthly is not Selic target annual.','Credit flow is nominal; not credit stock.','GDP per capita is local production, not household income.','Do not synthesize GDP per capita from a population of a different year.'],
       'ibgeNextStep':'Inspect official metadata and periods, verify variable/unit; download full municipal population and GDP per capita with their own years. Existing selected 30-municipality frozen sample is separately labeled in regional.json.'}
    out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n')
    print(json.dumps({s['key']:s['status'] for s in series}))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--out',type=Path,default=Path(__file__).resolve().parents[1]/'data/scenarios/external_sources.json');p.add_argument('--start',default='2016-01-01');p.add_argument('--end',default=dt.date.today().isoformat());p.add_argument('--timeout',type=int,default=8);a=p.parse_args();main(a.out,a.start,a.end,a.timeout)
