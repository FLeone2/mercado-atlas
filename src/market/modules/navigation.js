// Registered leaf IDs are stable contracts for old links, favorites and history.
// Old leaf routes now shown inside another area.
const TAB_ALIASES={ranking:'competition',structure:'segments'};
const marketTabs=[{id:'dashboard',label:'Panorama',previousLabels:['Visão geral']},{id:'history',label:'Evolução'},{id:'competition',label:'Concorrência',previousLabels:['Marcas e modelos']},{id:'ranking',label:'Ranking'},{id:'segments',label:'Porte',previousLabels:['Estrutura BD']},{id:'structure',label:'Pirâmide BD'},{id:'technology',label:'Propulsão'},{id:'origin',label:'Origem'},{id:'geography',label:'Mapas',previousLabels:['Territórios','Mapa do mercado']},{id:'geography3d',label:'3D'},{id:'explore',label:'Explorar'},{id:'animations',label:'Animações'},{id:'models',label:'Economia',previousLabels:['Cenários','Modelos e cenários']},{id:'quality',label:'Dados e metodologia',previousLabels:['Dados e atualização']}];
const marketNavigation=[
 {id:'dashboard',label:'Panorama',routes:['dashboard']},
 {id:'history',label:'Evolução',routes:['history']},
 {id:'competition',label:'Concorrência',routes:['competition']},
 {id:'segments',label:'Segmentos',routes:['segments','technology','origin']},
 {id:'geography',label:'Territórios',routes:['geography','geography3d']},
 {id:'explore',label:'Explorar',routes:['explore']},
 {id:'models',label:'Economia',routes:['models']},
 {id:'animations',label:'Animações',routes:['animations']}
];
function navigationLocation(tab,explorationView){
 const leaf=TAB_ALIASES[tab]??tab;
 return {leaf,group:marketNavigation.find(group=>group.routes.includes(leaf))??null,label:marketTabs.find(item=>item.id===leaf)?.label??'Panorama'};
}
// Moving between areas: the page crossfades and slides a little in the direction of travel (View Transitions),
// and falls back to an instant swap where the browser has none or the person prefers less motion.
const DOCK_ORDER=marketNavigation.map(group=>group.id);
function atlasTransition(update,direction){
 const root=document.documentElement;
 if(typeof document.startViewTransition!=='function'||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){update();return;}
 root.dataset.navDir=direction;
 const transition=document.startViewTransition(()=>ReactDOM.flushSync(update));
 transition.finished.finally(()=>{delete root.dataset.navDir;});
}
async function copyViewLink(){
 const url=globalThis.location?.href??'';
 try{await navigator.clipboard.writeText(url);return true;}catch{}
 const area=document.createElement('textarea');area.value=url;area.setAttribute('readonly','');area.style.cssText='position:fixed;opacity:0';document.body.appendChild(area);area.select();
 let ok=false;try{ok=document.execCommand('copy');}catch{}area.remove();return ok;
}
function navigationLeaves(tab,explorationView,scenarioView){
 const location=navigationLocation(tab,explorationView);
 const options=tab==='models'?SCENARIO_TABS.filter(item=>!item.hidden||item.value===scenarioView):(location.group?.routes??[tab]).map(id=>({value:id,label:marketTabs.find(item=>item.id===id)?.label??location.label}));
 return {location,options,value:tab==='models'?scenarioView:location.leaf};
}
// The areas live in a floating dock at the bottom; the leaves of the current area open as a small pill above it.
function MarketDock({tab,explorationView,onNavigate,scenarioView='diagnostic',onScenarioView}){
 const {location,options,value}=navigationLeaves(tab,explorationView,scenarioView);
 const listRef=React.useRef(null),[ind,setInd]=React.useState(null),activeId=location.group?.id;
 const measure=React.useCallback(()=>{const el=listRef.current?.querySelector('[aria-current="page"]');setInd(el?{x:el.offsetLeft,w:el.offsetWidth}:null);},[]);
 React.useLayoutEffect(measure,[activeId,tab,measure]);
 React.useEffect(()=>{addEventListener('resize',measure);document.fonts?.ready?.then(measure);return()=>removeEventListener('resize',measure);},[measure]);
 React.useEffect(()=>{listRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({inline:'center',block:'nearest'});},[activeId]);
 const go=id=>atlasTransition(()=>onNavigate(id),DOCK_ORDER.indexOf(id)>=DOCK_ORDER.indexOf(activeId)?'fwd':'back');
 const choose=tab==='models'?onScenarioView:onNavigate;
 return jsxRuntime.jsxs('div',{className:'at-dock-wrap',children:[
  options.length>1&&jsxRuntime.jsx('nav',{key:activeId,'aria-label':'Análises de '+(location.group?.label??location.label),className:'at-dock-leaves',children:options.map(item=>jsxRuntime.jsx('button',{type:'button','aria-current':value===item.value?'page':undefined,onClick:()=>atlasTransition(()=>choose?.(item.value),'fwd'),children:item.label},item.value))}),
  jsxRuntime.jsxs('nav',{ref:listRef,'aria-label':'Áreas do mercado',className:'at-dock',children:[
   ind&&jsxRuntime.jsx('span',{className:'at-dock-ind','aria-hidden':true,style:{transform:'translateX('+ind.x+'px)',width:ind.w}}),
   marketNavigation.map(group=>jsxRuntime.jsx('button',{type:'button','aria-current':activeId===group.id?'page':undefined,onClick:()=>go(group.id),children:group.label},group.id))
  ]})
 ]});
}
// Command palette (Ctrl/Cmd+K or "/"): jump to any area or analysis, share, print, change theme.
function CommandPalette({open,onClose,onNavigate}){
 const [query,setQuery]=React.useState(''),[cursor,setCursor]=React.useState(0),[note,setNote]=React.useState(''),inputRef=React.useRef(null);
 const fold=text=>String(text).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
 const items=React.useMemo(()=>{
  const list=[];
  for(const group of marketNavigation){
   list.push({id:group.routes[0],label:group.label,hint:'Área',run:()=>onNavigate(group.routes[0])});
   if(group.routes.length>1)for(const route of group.routes)list.push({id:route,label:group.label+' › '+(marketTabs.find(t=>t.id===route)?.label??route),hint:'Análise',run:()=>onNavigate(route)});
  }
  list.push({id:'quality',label:'Dados e metodologia',hint:'Confiança',run:()=>onNavigate('quality')},
   {id:'copy',label:'Copiar link desta visão',hint:'Compartilhar',keep:true,run:async()=>{setNote((await copyViewLink())?'Link copiado':'Copie o endereço do navegador');}},
   {id:'print',label:'Imprimir ou salvar PDF',hint:'Exportar',run:()=>setTimeout(()=>typeof printView==='function'?printView('area'):globalThis.print?.(),60)},
   {id:'theme',label:'Alternar claro e escuro',hint:'Aparência',run:()=>document.querySelector('.at-theme')?.click()});
  return list;
 },[onNavigate]);
 const shown=React.useMemo(()=>{const q=fold(query).trim();return q?items.filter(item=>fold(item.label+' '+item.hint).includes(q)):items;},[items,query]);
 React.useEffect(()=>{if(open){setQuery('');setCursor(0);setNote('');setTimeout(()=>inputRef.current?.focus(),30);}},[open]);
 React.useEffect(()=>{setCursor(0);},[query]);
 if(!open)return null;
 const pick=item=>{if(!item)return;if(!item.keep)onClose();const done=item.run();if(done?.then)done.catch(()=>{});};
 const onKey=e=>{
  if(e.key==='Escape'){e.preventDefault();onClose();}
  else if(e.key==='ArrowDown'){e.preventDefault();setCursor(c=>Math.min(shown.length-1,c+1));}
  else if(e.key==='ArrowUp'){e.preventDefault();setCursor(c=>Math.max(0,c-1));}
  else if(e.key==='Enter'){e.preventDefault();pick(shown[cursor]);}
 };
 return jsxRuntime.jsx('div',{className:'at-palette-scrim',onPointerDown:e=>{if(e.target===e.currentTarget)onClose();},children:
  jsxRuntime.jsxs('div',{className:'at-palette',role:'dialog','aria-modal':true,'aria-label':'Ir para',onKeyDown:onKey,children:[
   jsxRuntime.jsx('input',{ref:inputRef,className:'at-palette-input',value:query,placeholder:'Ir para uma área, compartilhar, imprimir…','aria-label':'Buscar comando',role:'combobox','aria-expanded':true,'aria-controls':'at-palette-list','aria-activedescendant':shown[cursor]?'at-pal-'+cursor:undefined,onChange:e=>setQuery(e.target.value)}),
   jsxRuntime.jsxs('ul',{id:'at-palette-list',role:'listbox',className:'at-palette-list',children:[
    shown.map((item,i)=>jsxRuntime.jsxs('li',{id:'at-pal-'+i,role:'option','aria-selected':i===cursor,onPointerMove:()=>setCursor(i),onClick:()=>pick(item),children:[jsxRuntime.jsx('span',{children:item.label}),jsxRuntime.jsx('small',{children:item.id==='copy'&&note?note:item.hint})]},item.id)),
    shown.length===0&&jsxRuntime.jsx('li',{className:'at-palette-empty',children:'Nada com esse nome.'})
   ]})
  ]})});
}
// Atlas masthead: wordmark, the eight areas, theme and (on phones) a menu toggle.
function MarketIdentity(){
 return jsxRuntime.jsxs('a',{className:'at-brand',href:'?',onClick:e=>{e.preventDefault();globalThis.scrollTo?.({top:0,behavior:'smooth'});},'aria-label':'Atlas · Mercado Automotivo, início',children:[
  jsxRuntime.jsx('span',{className:'at-wordmark',children:'ATLAS'}),
  jsxRuntime.jsx('span',{className:'at-brand-rule','aria-hidden':true}),
  jsxRuntime.jsx('span',{className:'at-brand-sub',children:'Mercado Automotivo'})
 ]});
}
function readTheme(){try{const t=document.documentElement.dataset.theme;if(t)return t;}catch{}return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light';}
function ThemeToggle(){
 const [theme,setTheme]=React.useState(readTheme);
 const [visual,setVisual]=React.useState(()=>document.documentElement.dataset.visualTheme==='liquid-aurora'?'liquid-aurora':'original');
 const originalMode=()=>{try{const saved=localStorage.getItem('atlas-theme');if(saved==='light'||saved==='dark')return saved;}catch{}return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light';};
 const selectVisual=value=>{
  const mode=value==='liquid-aurora'?'dark':originalMode();
  document.documentElement.dataset.visualTheme=value;
  document.documentElement.dataset.theme=mode;
  try{localStorage.setItem('atlas-visual-theme',value);}catch{}
  setVisual(value);setTheme(mode);
 };
 const next=theme==='dark'?'light':'dark';
 const choose=()=>{document.documentElement.dataset.theme=next;try{localStorage.setItem('atlas-theme',next);}catch{}setTheme(next);};
 return jsxRuntime.jsxs(jsxRuntime.Fragment,{children:[
  jsxRuntime.jsxs('label',{className:'at-visual-theme',children:[
   jsxRuntime.jsx('span',{className:'visually-hidden',children:'Tema do site'}),
   jsxRuntime.jsxs('select',{'aria-label':'Tema do site',value:visual,onChange:e=>selectVisual(e.target.value),children:[
    jsxRuntime.jsx('option',{value:'original',children:'Original'}),
    jsxRuntime.jsx('option',{value:'liquid-aurora',children:'Liquid Aurora'})
   ]})
  ]}),
  // Liquid Aurora is dark only: the toggle keeps its place (hidden) so the masthead sits where it does in the Original.
  jsxRuntime.jsx('button',{type:'button',className:'at-theme',...(visual==='original'?{}:{style:{visibility:'hidden'},'aria-hidden':true,tabIndex:-1,disabled:true}),onClick:choose,'aria-label':next==='dark'?'Usar tema escuro':'Usar tema claro',title:next==='dark'?'Tema escuro':'Tema claro',children:jsxRuntime.jsx('span',{'aria-hidden':true,children:theme==='dark'?'☼':'☾'})})
 ]});
}
function MarketHeader(props){
 const [palette,setPalette]=React.useState(false);
 const navigate=React.useCallback(id=>{props.onNavigate?.(id);},[props.onNavigate]);
 React.useEffect(()=>{
  const onKey=e=>{
   const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)||e.target?.isContentEditable;
   if((e.key==='k'||e.key==='K')&&(e.metaKey||e.ctrlKey)){e.preventDefault();setPalette(v=>!v);}
   else if(e.key==='/'&&!typing&&!e.metaKey&&!e.ctrlKey){e.preventDefault();setPalette(true);}
  };
  addEventListener('keydown',onKey);return()=>removeEventListener('keydown',onKey);
 },[]);
 return jsxRuntime.jsxs('header',{className:'at-masthead',children:[
  jsxRuntime.jsx(MarketIdentity,{}),
  jsxRuntime.jsxs('div',{className:'at-masthead-tools',children:[
   jsxRuntime.jsxs('button',{type:'button',className:'at-command',onClick:()=>setPalette(true),'aria-label':'Ir para… (Ctrl K)',children:[jsxRuntime.jsx('span',{children:'Ir para…'}),jsxRuntime.jsx('kbd',{'aria-hidden':true,children:'⌘K'})]}),
   jsxRuntime.jsx('button',{type:'button',className:'at-quiet-link','aria-current':props.tab==='quality'?'page':undefined,onClick:()=>props.onNavigate?.('quality'),children:'Dados e metodologia'}),
   jsxRuntime.jsx(ThemeToggle,{})
  ]}),
  ReactDOM.createPortal(jsxRuntime.jsx(CommandPalette,{open:palette,onClose:()=>setPalette(false),onNavigate:id=>atlasTransition(()=>navigate(id),'fwd')}),document.body)
 ]});
}

// Chapters arrive as you scroll: anything still below the fold when it mounts waits, then rises into place once.
const REVEAL_SELECTOR='.ax-section, .mp-strip, .ax-card, .hx-panel, .cr-card, .catalog-panel, .lm-card, .tbm-card, .pm-primary, .ctx-card, .cc-chart, .ac-chart, .am-overview-visuals';
function AtlasReveal(){
 React.useEffect(()=>{
  if(typeof IntersectionObserver!=='function'||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const seen=new WeakSet(),io=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.setAttribute('data-rv','in');io.unobserve(entry.target);}},{rootMargin:'0px 0px -8% 0px',threshold:.04});
  const scan=()=>{
   for(const el of document.querySelectorAll(REVEAL_SELECTOR)){
    if(seen.has(el))continue;seen.add(el);
    if(el.parentElement?.closest(REVEAL_SELECTOR))continue;
    if(el.getBoundingClientRect().top<innerHeight*.92)continue;
    el.setAttribute('data-rv','wait');io.observe(el);
   }
  };
  let frame=0;const mo=new MutationObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(scan);});
  mo.observe(document.body,{childList:true,subtree:true});scan();
  return()=>{mo.disconnect();io.disconnect();cancelAnimationFrame(frame);document.querySelectorAll('[data-rv]').forEach(el=>el.removeAttribute('data-rv'));};
 },[]);
 return null;
}
