// Explicit editorial notes only. React owns both the inline reference and portal;
// no DOM nodes are moved, observed, copied or registered outside their lifecycle.
var pageNotesContext;
function getPageNotesContext(){return pageNotesContext||(pageNotesContext=React.createContext(null));}
const PAGE_NOTE_CLASSES=new Set(['am-footnote','am-market-view-note','ev-interactive-note','catalog-method','cc-method','tc-intro','tc-panel-note','anm-map-note']);
function pageNotePlan(text,props={}){
 if(typeof text!=='string'||text.length<140||props.role||props['aria-live']||!PAGE_NOTE_CLASSES.has(props.className))return null;
 // Keep provenance, dates, units, definitions and consequential caveats at point of use.
 const sentences=text.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý“])/u);
 const essential=/(experimental|49\s*%|cobertura|denominador|base zero|indispon[ií]vel|aus[eê]ncia|ausentes|incompleto|desconhecid|n[aã]o informad|n[aã]o classificad|sem popula|sem anualiza|n[aã]o (?:[\wÀ-ÿ]+\s+){0,3}(?:demanda|causal|previs|confian|zero|renda|participa|garantia)|fonte:|refer[eê]ncia:|unidade:|per[ií]odo:|processad[oa] em|[=÷]|nominal|filtros? globais|n[aã]o restringe|n[aã]o altera|LOCAL\/IMP|sem ponto fictício|não são endereços|centroides podem|não permite comparar áreas)/i;
 const keep=sentences.map(s=>s.trim()).filter(s=>essential.test(s));
 // A concise local definition remains even when the long explanation is moved.
 if(!keep.length&&sentences[0]?.trim().length<=150)keep.push(sentences[0].trim());
 const summary=keep.join(' ');
 if(summary.length>=text.length-30)return null;
 return {text,summary};
}
function PageNotesLayout({children,notesScope,...props}){
 const [target,setTarget]=React.useState(null),details=React.useRef(null);
 const context=React.useMemo(()=>({target,reveal(id){if(details.current)details.current.open=true;const node=document.getElementById(id);if(node){node.focus({preventScroll:true});node.scrollIntoView({block:'nearest',behavior:'auto'});}}}),[target]);
 return jsxRuntime.jsx(getPageNotesContext().Provider,{value:context,children:jsxRuntime.jsxs('div',{...props,children:[children,jsxRuntime.jsx('footer',{className:'am-notes-footer','aria-label':'Notas e metodologia da análise atual',children:jsxRuntime.jsxs('details',{ref:details,className:'am-page-notes',children:[jsxRuntime.jsx('summary',{children:'Notas, metodologia e ajuda desta análise'}),jsxRuntime.jsx('div',{className:'am-notes-list',ref:setTarget})]},notesScope)})]})});
}
function PageNote({children,originalTag='p',...props}){
 const context=React.useContext(getPageNotesContext()),id='page-note-'+React.useId(),plan=pageNotePlan(children,props);
 if(!context?.target||!plan)return jsxRuntime.jsx(originalTag,{...props,children});
 const reference=id+'-reference';
 return jsxRuntime.jsxs(jsxRuntime.Fragment,{children:[jsxRuntime.jsxs(originalTag,{...props,className:props.className+' am-note-inline',children:[plan.summary?plan.summary+' ':null,jsxRuntime.jsx('button',{id:reference,type:'button',className:'am-note-reference','aria-controls':id,onClick:()=>context.reveal(id),children:'Detalhes no rodapé ↓'})]}),require('react-dom').createPortal(jsxRuntime.jsxs('section',{id,tabIndex:-1,className:'am-note-entry',children:[jsxRuntime.jsx('p',{children:plan.text}),jsxRuntime.jsx('a',{href:'#'+reference,children:'Voltar à análise ↑'})]}),context.target,id)]});
}
function PageNoteBlock({children,className='am-scenario-method',...props}){
 const context=React.useContext(getPageNotesContext()),id='page-note-'+React.useId(),reference=id+'-reference';
 if(!context?.target)return jsxRuntime.jsx('details',{...props,className,children});
 return jsxRuntime.jsxs(jsxRuntime.Fragment,{children:[jsxRuntime.jsx('button',{id:reference,type:'button',className:'am-note-reference','aria-controls':id,onClick:()=>context.reveal(id),children:'Método e fontes no rodapé ↓'}),require('react-dom').createPortal(jsxRuntime.jsxs('section',{id,tabIndex:-1,className:'am-note-entry',children:[jsxRuntime.jsx('details',{...props,className,open:true,children}),jsxRuntime.jsx('a',{href:'#'+reference,children:'Voltar à análise ↑'})]}),context.target,id)]});
}
if(typeof module!=='undefined'&&module.exports)module.exports={pageNotePlan,PAGE_NOTE_CLASSES};
// Shared chart/table descriptions are also authored explanations. Keep the
// original component/data/export contract and route only long prose through PageNote.
function PageNotedEvidenceChart(props){return pageNotedComponent(dataApp.EvidenceChart,props);}
function PageNotedDataComponent(props){return pageNotedComponent(dataApp.DataComponent,props);}
function pageNotedComponent(Component,props){
 const plan=pageNotePlan(props.description,{className:'am-footnote'});
 if(!plan)return jsxRuntime.jsx(Component,props);
 return jsxRuntime.jsxs(jsxRuntime.Fragment,{children:[jsxRuntime.jsx(Component,{...props,description:undefined}),jsxRuntime.jsx(PageNote,{className:'am-footnote',children:props.description})]});
}
