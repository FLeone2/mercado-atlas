// Positions of the 5.570 municipalities in the national map projection (data/geography/municipal-points.json),
// fetched once per data base: rows are [code, name, uf, x, y].
const tbmPointsCache=new Map();

function useTbmPoints(base){
 const [state,setState]=React.useState(()=>({data:tbmPointsCache.get(base)??null,error:null}));
 React.useEffect(()=>{if(tbmPointsCache.has(base)){setState({data:tbmPointsCache.get(base),error:null});return;}let active=true;const controller=new AbortController();
  fetch(new URL('geography/municipal-points.json',base),{signal:controller.signal,credentials:'same-origin',redirect:'error'}).then(r=>{if(!r.ok)throw Error('Posições municipais indisponíveis.');return r.json();})
   .then(data=>{if(data.version!==1||!Array.isArray(data.rows))throw Error('Posições municipais incompatíveis.');tbmPointsCache.set(base,data);if(active)setState({data,error:null});})
   .catch(e=>{if(active&&e.name!=='AbortError')setState({data:null,error:e.message});});
  return()=>{active=false;controller.abort();};},[base]);
 return state;
}
