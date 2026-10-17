const assert=require('node:assert/strict');
const {flowModel,flowLayout}=require('../src/market/modules/flow-sankey.js');
const P=(origem,canal,combustivel,segmento,count)=>({origem,canal,combustivel,segmento,count});
const paths=[P('Nacional','Varejo','Flex','SUV',50),P('Nacional','Venda direta','Flex','Hatch',30),P('Importado','Varejo','Elétrico','SUV',10),P('Importado','Venda direta','Diesel','Picape média',8),P('Nacional','Varejo','Flex','Minivan',1),P('Nacional','Varejo','Flex','Não classificado',3),P('Não classificado','Varejo','Flex','SUV',2)];
const m=flowModel(paths,{topSegments:3});
assert.equal(m.dropped,5,'unclassified paths leave the picture');assert.equal(m.total,99);
for(const c of m.columns)assert.equal(c.nodes.reduce((s,n)=>s+n.value,0),m.total,c.key+' column sums to the total');
assert.deepEqual(m.columns[0].nodes.map(n=>n.name),['Nacional','Importado']);assert.deepEqual(m.columns[1].nodes.map(n=>n.name),['Varejo','Venda direta']);
assert.deepEqual(m.columns[2].nodes.map(n=>n.name),['Flex','Diesel','Elétrico'],'fuel order is fixed');
assert(m.columns[3].nodes.map(n=>n.name).includes('Outros'),'small vehicle types fold into Outros');assert.equal(m.columns[3].nodes.at(-1).name,'Outros');
// Links per origin: what leaves a node equals what enters it.
for(let c=0;c<3;c++)for(const n of m.columns[c+1].nodes){const into=m.links.filter(l=>l.col===c&&l.to===n.name).reduce((s,l)=>s+l.value,0),out=c<2?m.links.filter(l=>l.col===c+1&&l.from===n.name).reduce((s,l)=>s+l.value,0):into;assert.equal(into,n.value);assert.equal(out,n.value);}
const L=flowLayout(m,{width:900,height:400});
assert(L.ribbons.every(r=>/^M[-\d.,]+C/.test(r.d)&&!/NaN|undefined/.test(r.d)),'every ribbon path is numeric');
for(let ci=0;ci<4;ci++){const nodes=L.nodes.filter(n=>n.col===ci);assert(Math.abs(nodes.reduce((s,n)=>s+n.h,0)+(nodes.length>1?(400-m.total*L.scale):0)-400)<1e-6,'column '+ci+' fills the height');
 for(let i=1;i<nodes.length;i++)assert(nodes[i].y>=nodes[i-1].y+nodes[i-1].h-1e-9,'nodes do not overlap');}
assert(Math.abs(L.ribbons.filter(r=>r.col===0).reduce((s,r)=>s+r.thickness,0)-m.total*L.scale)<1e-6,'ribbons between two columns carry the whole total');
console.log('PASS flow sankey: columns sum to the total, fixed orders, Outros, conserved ribbons, numeric geometry.');
