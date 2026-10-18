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
// Notes sit behind an ⓘ next to where they apply; no footer of notes per area.
// Status notes (role / aria-live) stay visible text: they report the current state.
function PageNotesLayout({children,notesScope,...props}){
 return jsxRuntime.jsx('div',{...props,children});
}
function PageNote({children,originalTag='p',...props}){
 if(props.role||props['aria-live'])return jsxRuntime.jsx(originalTag,{...props,children});
 return jsxRuntime.jsx('div',{className:'am-note-info',children:jsxRuntime.jsx(dataApp.Info,{label:'Nota',children})});
}
function PageNoteBlock({children,className='am-scenario-method',...props}){
 return jsxRuntime.jsx('details',{...props,className,children});
}
if(typeof module!=='undefined'&&module.exports)module.exports={pageNotePlan,PAGE_NOTE_CLASSES};
// Chart and table descriptions show as the ⓘ next to the title (src/kit/cards.jsx).

function PageNotedEvidenceChart(props){return pageNotedComponent(dataApp.EvidenceChart,props);}
function PageNotedDataComponent(props){return pageNotedComponent(dataApp.DataComponent,props);}
function pageNotedComponent(Component,props){return jsxRuntime.jsx(Component,props);}
