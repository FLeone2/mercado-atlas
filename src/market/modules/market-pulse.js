// "Pulso do recorte": the five numbers people look for first, on every area, and
// "Perguntas rápidas" on Panorama. Both read the same two market queries: the
// market without brand/model filters, and the brand in focus inside it.
const PULSE_BRAND_FILTERS=['marca','modelo','grupo_modelo'];
const pulseFormat={
 number:v=>v==null||!Number.isFinite(v)?'—':new Intl.NumberFormat('pt-BR').format(Math.round(v)),
 percent:(v,d=1)=>v==null||!Number.isFinite(v)?'—':new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:d,maximumFractionDigits:d}).format(v),
 signed:(v,d=1)=>v==null||!Number.isFinite(v)?'—':(v>0?'+':'')+new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:d,maximumFractionDigits:d}).format(v),
 pp:v=>v==null||!Number.isFinite(v)?'—':(v>0?'+':'')+new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v*100)+' pp'
};
// Focus: the single brand the user filtered, otherwise Mitsubishi (src/market/modules/market-request.js).
function pulseFocusBrand(filters){return marketFocusBrand(filters);}
function pulseFilters(filters,focus){const market={...filters};for(const k of PULSE_BRAND_FILTERS)delete market[k];return {market,focus:{...market,marca:[focus]}};}
function pulseRange(result,filters){const r=result?.range??result?.requestedRange;if(r?.start&&r?.end)return r;const m=/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(String(filters?.date??''));return m?{start:m[1],end:m[2]}:null;}
function pulseWorkingDays(range){
 if(!range?.start||!range?.end||typeof historyHolidays!=='function')return null;
 let n=0,cache=new Map();for(let t=Date.parse(range.start+'T12:00:00Z'),end=Date.parse(range.end+'T12:00:00Z');t<=end;t+=86400000){const d=new Date(t),y=d.getUTCFullYear(),w=d.getUTCDay();if(!cache.has(y))cache.set(y,historyHolidays(y));if(w!==0&&w!==6&&!cache.get(y).has(d.toISOString().slice(0,10)))n++;}
 return n||null;
}
function pulseShiftYear(range){if(!range)return null;const shift=d=>{const y=+d.slice(0,4)-1,rest=d.slice(4);const t=new Date(Date.UTC(y,+rest.slice(1,3)-1,+rest.slice(4,6)));return t.getUTCMonth()===+rest.slice(1,3)-1?t.toISOString().slice(0,10):new Date(Date.UTC(y,+rest.slice(1,3),0)).toISOString().slice(0,10);};return {start:shift(range.start),end:shift(range.end)};}
function pulseModel(market,focusResult,focus,filters){
 if(!market)return null;
 const brands=(market.groups?.marca??[]).filter(b=>b.count>0),i=brands.findIndex(b=>b.name===focus);
 const previous=[...(market.groups?.marca??[])].filter(b=>(b.previous??0)>0).sort((a,b)=>b.previous-a.previous||a.name.localeCompare(b.name)),pi=previous.findIndex(b=>b.name===focus);
 // No market total means the channel (or the data) does not exist in the source: the brand is unavailable too, never zero (AT-08).
 const unavailable=market.total==null,focusTotal=unavailable?null:(focusResult?.total??(i>=0?brands[i].count:null)),share=market.total>0&&focusTotal!=null?focusTotal/market.total:null;
 const shareYear=focusResult?.year!=null&&market.year>0?focusResult.year/market.year:null;
 const range=pulseRange(market,filters),yearRange=market.yearRange??pulseShiftYear(range),days=pulseWorkingDays(range),yearDays=pulseWorkingDays(yearRange);
 const pace=days&&market.total!=null?market.total/days:null,paceYear=yearDays&&market.year!=null?market.year/yearDays:null;
 const ufs=new Map((market.groups?.uf??[]).map(r=>[r.name,r.count])),strong=(focusResult?.groups?.uf??[]).map(r=>({name:r.name,count:r.count,share:ufs.get(r.name)>0?r.count/ufs.get(r.name):null})).filter(r=>r.share!=null&&r.count>=Math.max(50,(focusTotal??0)*0.03)).sort((a,b)=>b.share-a.share);
 const electrified=(market.groups?.propulsao??[]).filter(r=>['HEV','PHEV','BEV','MHEV'].includes(r.name)).reduce((s,r)=>s+r.count,0);
 return {focus,range,market:market.total,marketYearChange:market.yearChangeRate,marketPreviousChange:market.changeRate,focusTotal,focusYearChange:unavailable?null:(focusResult?.yearChangeRate??null),share,shareYearChange:share!=null&&shareYear!=null?share-shareYear:null,
  rank:i>=0?i+1:null,brands:brands.length,previousRank:pi>=0?pi+1:null,pace,paceYearChange:pace!=null&&paceYear>0?pace/paceYear-1:null,days,yearDays,
  leader:brands[0]?{name:brands[0].name,share:market.total>0?brands[0].count/market.total:null}:null,strongestUF:strong[0]??null,topSegment:(focusResult?.groups?.bd_segmento??[])[0]??null,electrifiedShare:market.total>0?electrified/market.total:null,complete:market.complete!==false};
}
// One query answers both numbers: the market result carries the focus brand (result.focus).
// When the page's own market query has no brand/model filter, it already is that query.
function useMarketPulse(filters,enabled=true,shared=null){
 const focus=pulseFocusBrand(filters),split=React.useMemo(()=>pulseFilters(filters,focus),[canonicalFilterKey(filters),focus]);
 const reuse=Boolean(shared)&&canonicalFilterKey(split.market)===canonicalFilterKey(filters);
 const own=useMarketData(split.market,enabled&&!reuse,'pulse',false,focus);
 const source=reuse?shared:own,market=source.result??null,brand=market?.focus?.brand===focus?market.focus:null;
 const model=React.useMemo(()=>pulseModel(market,brand,focus,filters),[market,brand,focus]);
 return {model,pending:Boolean(source.pending),error:source.error??null,focus};
}
function PulseChange({value,format='signed',label}){
 if(value==null||!Number.isFinite(value))return jsxRuntime.jsx('small',{className:'mp-change',children:label?label+': —':'—'});
 const dir=value>0?'up':value<0?'down':'flat';
 return jsxRuntime.jsxs('small',{className:'mp-change mp-'+dir,children:[jsxRuntime.jsx('span',{'aria-hidden':true,children:dir==='up'?'▲ ':dir==='down'?'▼ ':'■ '}),pulseFormat[format](value),label?' '+label:'']});
}
function MarketPulse({filters,enabled=true,shared=null}){
 const {model,pending,error,focus}=useMarketPulse(filters,enabled,shared),name=focus.charAt(0)+focus.slice(1).toLowerCase();
 if(error)return null;
 const tile=(key,label,value,change,title)=>jsxRuntime.jsxs('div',{className:'mp-tile',title,children:[jsxRuntime.jsx('span',{className:'mp-label',children:label}),jsxRuntime.jsx('strong',{children:pending||!model?'…':value}),pending||!model?jsxRuntime.jsx('small',{className:'mp-change',children:' '}):change]},key);
 const br=d=>d?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'';
 return jsxRuntime.jsxs('section',{className:'mp-strip','aria-label':'Pulso do recorte','aria-busy':pending,'data-period':model?.range?br(model.range.start)+' a '+br(model.range.end):undefined,children:[
  tile('market','Mercado no período',pulseFormat.number(model?.market),jsxRuntime.jsx(PulseChange,{value:model?.marketYearChange,label:'vs ano anterior'}),'Emplacamentos com os filtros globais, sem filtros de marca e modelo.'),
  tile('focus',name,pulseFormat.number(model?.focusTotal),jsxRuntime.jsx(PulseChange,{value:model?.focusYearChange,label:'vs ano anterior'}),'Emplacamentos da marca em foco no mesmo recorte.'),
  tile('share','Participação '+name,pulseFormat.percent(model?.share,2),jsxRuntime.jsx(PulseChange,{value:model?.shareYearChange,format:'pp',label:'vs ano anterior'}),'Marca em foco ÷ mercado do recorte.'),
  tile('rank','Posição entre as marcas',model?.rank?model.rank+'º de '+model.brands:'—',jsxRuntime.jsx('small',{className:'mp-change',children:model?.previousRank?'Período anterior: '+model.previousRank+'º':'Sem período anterior comparável'}),'Ranking por volume no recorte, sem filtros de marca.'),
  tile('pace','Ritmo por dia útil',model?.pace!=null?pulseFormat.number(model.pace)+'/dia':'—',jsxRuntime.jsx(PulseChange,{value:model?.paceYearChange,label:'vs ano anterior'}),'Mercado ÷ dias úteis do período ('+(model?.days??'—')+' dias; sem fins de semana, feriados nacionais, Carnaval e Corpus Christi). Compara períodos com números de dias úteis diferentes.')
 ]});
}
// Panorama: four highlights, a number each, with a way into the area.
function QuickQuestions({filters,onNavigate,shared=null}){
 const {model,pending,focus}=useMarketPulse(filters,true,shared),name=focus.charAt(0)+focus.slice(1).toLowerCase(),f=pulseFormat;
 const go=tab=>()=>{onNavigate?.(tab);globalThis.scrollTo?.({top:0,behavior:'smooth'});};
 const ready=!pending&&model;
 const cards=[
  ['leader','Marca líder',model?.leader?.name??'—',model?.leader?f.percent(model.leader.share,1)+' do mercado':'','competition'],
  ['strong','UF mais forte · '+name,model?.strongestUF?.name??'—',model?.strongestUF?f.percent(model.strongestUF.share,1)+' do mercado local':'','geography'],
  ['segment','Segmento principal · '+name,model?.topSegment?.name??'—',model?.topSegment&&model.focusTotal>0?f.percent(model.topSegment.count/model.focusTotal,0)+' da marca':'','segments'],
  ['electric','Eletrificados',f.percent(model?.electrifiedShare,1),'HEV, PHEV, BEV, MHEV','technology']
 ];
 return jsxRuntime.jsxs('section',{className:'mp-highlights','aria-label':'Destaques',children:[
  cards.map(([key,label,value,detail,tab])=>jsxRuntime.jsxs('button',{type:'button',className:'mp-highlight',onClick:go(tab),children:[jsxRuntime.jsx('span',{className:'mp-label',children:label}),jsxRuntime.jsx('strong',{'aria-live':'polite',children:ready?value:'…'}),jsxRuntime.jsx('small',{children:ready?detail:' '}),jsxRuntime.jsx('span',{className:'mp-highlight-go','aria-hidden':true,children:'→'})]},key)),
  typeof PrintButton==='function'&&jsxRuntime.jsx(PrintButton,{mode:'summary',label:'Resumo (PDF)',className:'am-small-button mp-highlight-print'})
 ]});
}
if(typeof module!=='undefined'&&module.exports)module.exports={pulseFocusBrand,pulseFilters,pulseModel,pulseWorkingDays,pulseShiftYear,pulseFormat};
