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
function MarketNavigation({tab,explorationView,onNavigate}){
 const location=navigationLocation(tab,explorationView);
 return jsxRuntime.jsx('nav',{'aria-label':'Áreas do mercado',className:'at-nav am-primary-nav',children:marketNavigation.map(group=>jsxRuntime.jsx('button',{type:'button',className:'am-nav-link','aria-current':location.group?.id===group.id?'page':undefined,onClick:()=>onNavigate(group.id),children:group.label},group.id))});
}
// Every area uses the same second row, outside the shell's primary header.
// Leaf routes keep their URL contracts; analytical views keep their own state.
// The address bar already carries the area and the filters: copy it to share this exact view.
function CopyViewLink(){
 const [status,setStatus]=React.useState(''),timer=React.useRef(null);
 React.useEffect(()=>()=>clearTimeout(timer.current),[]);
 const copy=async()=>{const url=globalThis.location?.href??'';let ok=false;try{await navigator.clipboard.writeText(url);ok=true;}catch{const area=document.createElement('textarea');area.value=url;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();try{ok=document.execCommand('copy');}catch{}area.remove();}
  setStatus(ok?'Link copiado':'Copie o endereço do navegador');clearTimeout(timer.current);timer.current=setTimeout(()=>setStatus(''),2500);};
 return jsxRuntime.jsxs('button',{type:'button',className:'am-nav-link am-copy-link',onClick:copy,title:'Copia um link com esta área e estes filtros',children:[jsxRuntime.jsx('span',{'aria-hidden':true,className:'at-link-icon',children:'↗ '}),jsxRuntime.jsx('span',{'aria-live':'polite',children:status||'Copiar link'})]});
}
function MarketSubnavigation({tab,explorationView,onNavigate,evolutionView='executive',onEvolutionView,scenarioView='diagnostic',onScenarioView}){
 const location=navigationLocation(tab,explorationView);
 const options=tab==='models'?SCENARIO_TABS.filter(item=>!item.hidden||item.value===scenarioView):(location.group?.routes??[tab]).map(id=>({value:id,label:marketTabs.find(item=>item.id===id)?.label??location.label}));
 const value=tab==='models'?scenarioView:location.leaf;
 const choose=tab==='models'?onScenarioView:onNavigate;
 return jsxRuntime.jsxs('div',{className:'am-subnavigation',children:[options.length>1?jsxRuntime.jsx('nav',{'aria-label':'Análises de '+(location.group?.label??location.label),className:'am-leaf-nav',children:options.map(item=>jsxRuntime.jsx('button',{type:'button',className:'am-nav-link','aria-current':value===item.value?'page':undefined,onClick:()=>choose?.(item.value),children:item.label},item.value))}):jsxRuntime.jsx('span',{className:'am-leaf-nav'}),jsxRuntime.jsxs('nav',{'aria-label':'Compartilhar e documentação',className:'am-secondary-nav',children:[jsxRuntime.jsx(CopyViewLink,{}),typeof PrintButton==='function'&&jsxRuntime.jsx(PrintButton,{label:'Imprimir / PDF'}),jsxRuntime.jsx('button',{type:'button',className:'am-nav-link','aria-current':tab==='quality'?'page':undefined,onClick:()=>onNavigate('quality'),children:'Dados e metodologia'})]})]});
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
  visual==='original'&&jsxRuntime.jsx('button',{type:'button',className:'at-theme',onClick:choose,'aria-label':next==='dark'?'Usar tema escuro':'Usar tema claro',title:next==='dark'?'Tema escuro':'Tema claro',children:jsxRuntime.jsx('span',{'aria-hidden':true,children:theme==='dark'?'☼':'☾'})})
 ]});
}
function MarketHeader(props){
 const [open,setOpen]=React.useState(false);
 const navigate=id=>{setOpen(false);props.onNavigate?.(id);};
 return jsxRuntime.jsxs('header',{className:'at-masthead','data-menu-open':open||undefined,children:[
  jsxRuntime.jsx(MarketIdentity,{}),
  jsxRuntime.jsx(MarketNavigation,{...props,onNavigate:navigate}),
  jsxRuntime.jsxs('div',{className:'at-masthead-tools',children:[
   jsxRuntime.jsx(ThemeToggle,{}),
   jsxRuntime.jsx('button',{type:'button',className:'at-menu-toggle','aria-expanded':open,'aria-label':open?'Fechar menu':'Abrir menu',onClick:()=>setOpen(o=>!o),children:jsxRuntime.jsx('span',{'aria-hidden':true,children:open?'×':'≡'})})
  ]})
 ]});
}
