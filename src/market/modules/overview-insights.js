/* "O que mudou": the Panorama opens with plain sentences computed from the same
   model as its KPI cards (selected period vs the previous period of equal length,
   and the total vs the same period a year earlier). No sentence is shown when its
   comparison is unavailable; shares use the full filtered market as denominator. */
const INSIGHT_NAMES={FIAT:'Fiat',VW:'VW',GM:'GM',BYD:'BYD',TOYOTA:'Toyota',HYUNDAI:'Hyundai',RENAULT:'Renault',JEEP:'Jeep',HONDA:'Honda',NISSAN:'Nissan',GWM:'GWM',GEELY:'Geely',FORD:'Ford',CITROEN:'Citroën',PEUGEOT:'Peugeot','CAOA CHERY':'Caoa Chery',MITSUBISHI:'Mitsubishi'};
const insightName=b=>INSIGHT_NAMES[b]??(String(b).charAt(0)+String(b).slice(1).toLowerCase());
const insightInt=n=>Math.round(n).toLocaleString('pt-BR');
const insightPct=(x,d=1)=>(x*100).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})+'%';
const insightSigned=(x,d=1)=>(x>0?'+':x<0?'−':'')+insightPct(Math.abs(x),d);
const insightPP=x=>(x>0?'+':x<0?'−':'')+Math.abs(x*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' p.p.';

function overviewInsights(model){
 if(!model||!(model.total>0))return [];
 const brands=(model.groups?.marca??[]).filter(r=>Number.isFinite(r.count)&&r.count>0).sort((a,b)=>b.count-a.count);
 const out=[];
 const parts=[];
 if(Number.isFinite(model.changeRate))parts.push(insightSigned(model.changeRate)+' sobre o período anterior');
 if(Number.isFinite(model.yearChangeRate))parts.push(insightSigned(model.yearChangeRate)+' sobre o mesmo período do ano anterior');
 out.push({id:'total',tone:Number.isFinite(model.yearChangeRate)?(model.yearChangeRate>=0?'up':'down'):Number.isFinite(model.changeRate)?(model.changeRate>=0?'up':'down'):'neutral',
  text:insightInt(model.total)+' emplacamentos no recorte'+(parts.length?', '+parts.join(' e '):'')+'.'});
 if(brands.length){
  const lead=brands[0],second=brands[1];
  out.push({id:'leader',tone:'neutral',text:insightName(lead.name)+' lidera com '+insightPct(lead.count/model.total)+' do mercado'+(second?', '+insightPP((lead.count-second.count)/model.total).replace('+','')+' à frente de '+insightName(second.name):'')+'.'});
  const top3=brands.slice(0,3).reduce((s,r)=>s+r.count,0)/model.total;
  out.push({id:'concentration',tone:'neutral',text:'As três maiores marcas somam '+insightPct(top3)+' dos emplacamentos.'});
  // Share movement among brands with enough volume to matter (≥0,5% of the market).
  const movers=brands.filter(r=>Number.isFinite(r.shareChange)&&r.count/model.total>=.005);
  const gain=movers.reduce((a,r)=>!a||r.shareChange>a.shareChange?r:a,null),loss=movers.reduce((a,r)=>!a||r.shareChange<a.shareChange?r:a,null);
  if(gain&&gain.shareChange>=.0005)out.push({id:'gain',tone:'up',text:insightName(gain.name)+' foi quem mais ganhou participação: '+insightPP(gain.shareChange)+' sobre o período anterior, para '+insightPct(gain.count/model.total)+'.'});
  if(loss&&loss.shareChange<=-.0005&&loss!==gain)out.push({id:'loss',tone:'down',text:insightName(loss.name)+' foi quem mais perdeu participação: '+insightPP(loss.shareChange)+', para '+insightPct(loss.count/model.total)+'.'});
  const mitIndex=brands.findIndex(r=>r.name==='MITSUBISHI');
  if(mitIndex>=0){const m=brands[mitIndex];out.push({id:'mitsubishi',tone:'brand',text:'Mitsubishi: '+insightInt(m.count)+' emplacamentos, '+insightPct(m.count/model.total,2)+' do mercado, '+(mitIndex+1)+'ª marca'+(Number.isFinite(m.changeRate)?', '+insightSigned(m.changeRate)+' sobre o período anterior':'')+'.'});}
 }
 return out;
}

if(typeof module!=='undefined'&&module.exports)module.exports={overviewInsights};
