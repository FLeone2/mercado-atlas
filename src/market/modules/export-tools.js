// "Baixar imagem" for the authored SVG charts. The drawing (colours resolved, Atlas
// fonts embedded, legend, title and source line) lives in the kit: src/kit/export.js.
const EXPORT_STYLE_PROPS=dataApp.EXPORT_STYLE_PROPS;
const exportLegend=dataApp.exportLegend;
const exportSvgToPng=dataApp.exportSvgToPng;
// Place inside the chart container; it exports the first SVG of the nearest [data-export-root].
function ExportImageButton({name='grafico',title=''}){
 const [busy,setBusy]=React.useState(false);
 const run=async e=>{const root=e.currentTarget.closest('[data-export-root]'),svg=root?.querySelector('svg');if(!svg)return;setBusy(true);try{await exportSvgToPng(svg,{filename:name,title:title||root.getAttribute('data-export-title')||'',legend:exportLegend(root)});}catch(error){globalThis.alert?.(error.message);}finally{setBusy(false);}};
 return jsxRuntime.jsx('button',{type:'button',className:'export-image-button',onClick:run,disabled:busy,title:'Baixar este gráfico como imagem PNG','aria-label':'Baixar gráfico como imagem PNG',children:busy?'Gerando…':'Baixar PNG'});
}
// Print: the whole area with print styles, or a one-page summary of Panorama.
// A temporary header states the area, the filters (from the address bar) and the date.
function printFilterSummary(){
 const params=new URLSearchParams(globalThis.location?.search??''),parts=[];
 for(const [key,value] of params){if(!key.startsWith('f.'))continue;const field=key.slice(2),label=typeof HISTORY_FILTER_LABELS!=='undefined'&&HISTORY_FILTER_LABELS[field]?HISTORY_FILTER_LABELS[field]:field==='date'?'Período':field==='population'?'Universo':field;parts.push(label+': '+value.replace('..',' a ').replace(/,/g,', '));}
 const period=document.querySelector('.mp-strip[data-period]')?.getAttribute('data-period');if(period&&!params.has('f.date'))parts.unshift('Período: '+period);
 return parts.length?parts.join(' · '):'Sem filtros';
}
function printView(mode='area'){
 const root=document.documentElement,hidden=[],header=document.createElement('div');
 const area=document.querySelector('.at-nav [aria-current=page]')?.textContent?.trim()??'Mercado Automotivo';
 header.className='print-header';header.innerHTML='';const strong=document.createElement('strong');strong.textContent='Atlas · Mercado Automotivo · '+(mode==='summary'?'Resumo':area);const small=document.createElement('span');small.textContent=printFilterSummary()+' · gerado em '+new Date().toLocaleDateString('pt-BR');header.append(strong,small);document.body.prepend(header);
 if(mode==='summary'){
  const keep=[...document.querySelectorAll('.mp-strip,.oi-card,.mp-highlights')],path=new Set();
  keep.push(header);for(const el of keep){let n=el;while(n&&n!==document.documentElement){path.add(n);n=n.parentElement;}}
  for(const el of path){if(keep.includes(el))continue;for(const child of el.children)if(!path.has(child)){child.setAttribute('data-print-hide','');hidden.push(child);}}
  root.classList.add('print-summary');
 }
 let finished=false;const done=()=>{if(finished)return;finished=true;for(const el of hidden)el.removeAttribute('data-print-hide');root.classList.remove('print-summary');header.remove();globalThis.removeEventListener('afterprint',done);};
 globalThis.addEventListener('afterprint',done);globalThis.print();setTimeout(done,1500);
}
function PrintButton({mode='area',label='Imprimir ou salvar PDF',className='am-nav-link'}){
 return jsxRuntime.jsxs('button',{type:'button',className,onClick:()=>printView(mode),title:mode==='summary'?'Resumo de uma página: pulso, o que mudou e perguntas rápidas':'Imprime a área atual (ou salve como PDF na janela de impressão)',children:[jsxRuntime.jsx('span',{'aria-hidden':true,children:'⎙ '}),label]});
}
if(typeof module!=='undefined'&&module.exports)module.exports={EXPORT_STYLE_PROPS,exportLegend};
