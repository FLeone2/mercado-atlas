// Keep only committed, compatible chart elements. Never relabel old rows as new.
function performanceFilterLabel(filters){
 return Object.entries(filters??{}).filter(([,value])=>value!=null&&value!==''&&value!=='all'&&(!Array.isArray(value)||value.length)).map(([field,value])=>(field==='date'?'Período':typeof LABELS$1==='undefined'?field:LABELS$1[field]??field)+': '+(Array.isArray(value)?value.join(', '):String(value))).join(' · ')||'Todos os filtros';
}
function performanceSnapshot(saved,{pending,error,ready,compatibilityKey,children,label}){
 if(error||!pending&&!ready||saved&&saved.compatibilityKey!==compatibilityKey)saved=null;
 const stale=Boolean(pending&&saved);
 return {stale,children:stale?saved.children:children,label:stale?saved.label:label};
}
function PendingChartSnapshot({pending,error,ready,compatibilityKey,label,children}){
 const committed=React.useRef(null);
 // Commit after rendering: interrupted/concurrent renders cannot overwrite a good chart.
 React.useLayoutEffect(()=>{if(!pending)committed.current=ready&&!error?{children,label,compatibilityKey}:null;else if(committed.current?.compatibilityKey!==compatibilityKey)committed.current=null;},[pending,error,ready,compatibilityKey,label,children]);
 const view=performanceSnapshot(committed.current,{pending,error,ready,compatibilityKey,children,label});
 const block=event=>{if(view.stale){event.preventDefault();event.stopPropagation();}};
 return jsxRuntime.jsxs('section',{'aria-busy':Boolean(pending),'data-chart-stale':view.stale?'true':'false',children:[
  view.stale&&jsxRuntime.jsxs('div',{role:'status',className:'am-stale-notice',style:{padding:'12px 16px',marginBottom:12,border:'2px solid #b7791f',borderRadius:8,background:'#fff4ce',color:'#422c00'},children:[jsxRuntime.jsx('strong',{children:'Atualizando. O gráfico abaixo ainda mostra o recorte anterior.'}),jsxRuntime.jsx('p',{children:'Exibido (anterior): '+view.label}),jsxRuntime.jsx('p',{children:'Solicitado (em cálculo): '+label}),jsxRuntime.jsx('small',{children:'Interações, detalhes e exportações do gráfico ficam desativados até concluir.'})]}),
  jsxRuntime.jsx('div',{inert:view.stale||undefined,'aria-disabled':view.stale||undefined,onClickCapture:block,onKeyDownCapture:block,onPointerDownCapture:block,onSubmitCapture:block,onFocusCapture:event=>{if(view.stale){event.target.blur?.();event.stopPropagation();}},style:view.stale?{pointerEvents:'none',opacity:0.65}:undefined,children:view.children})
 ]});
}
