// Panorama opening: the period in one sentence, two figures and the national map of
// registrations by municipality (one dot per city, area proportional to volume).
// Same filters and period as the rest of the page; the largest city is annotated.
const heroNorm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
function heroDots(points,rows){
 if(!points?.rows||!rows?.length)return [];
 const totals=new Map();
 for(const r of rows){const name=String(r.name??''),i=name.lastIndexOf(' · ');if(i<0)continue;totals.set(heroNorm(name.slice(0,i))+'|'+name.slice(i+3).trim(),r.count);}
 return points.rows.map(([code,name,uf,x,y])=>({code,name,uf,x,y,v:totals.get(heroNorm(name)+'|'+uf)??0})).filter(d=>d.v>0).sort((a,b)=>a.v-b.v);
}
function AtlasHero({model,period,base,yearLabel,onExplore,onTerritory}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs,points=useTbmPoints(base).data;
 const dots=React.useMemo(()=>heroDots(points,model?.groups?.municipio),[points,model]);
 const max=dots.length?dots[dots.length-1].v:1,top=dots[dots.length-1];
 const radius=v=>0.9+Math.sqrt(v/max)*17;
 return hs('section',{className:'at-hero','aria-labelledby':'at-hero-title',children:[
  hs('div',{className:'at-hero-copy',children:[
   h('p',{className:'at-eyebrow',children:'Painel do mercado · '+(period??'carregando')}),
   hs('h1',{id:'at-hero-title',children:['O mercado,',h('br',{}),'em um olhar.']}),
   h('p',{className:'at-hero-lede',children:'Volume, marcas, tecnologia e território dos emplacamentos no Brasil, com o mesmo recorte em todas as telas.'}),
   hs('div',{className:'at-hero-figures',children:[
    hs('div',{children:[h('strong',{children:model?number(model.total):'—'}),h('span',{children:'Emplacamentos'})]}),
    hs('div',{children:[h('strong',{children:model?signed(model.yearChangeRate):'—'}),h('span',{children:model?.yearAvailable?'Sobre '+yearLabel:'Sem base anual comparável'})]})
   ]}),
   h('button',{type:'button',className:'at-cta',onClick:onExplore,children:'Começar a explorar ⟶'}),
   h('p',{className:'at-hero-note',children:'Automóveis + comerciais leves · cada ponto é um município, área proporcional ao volume'})
  ]}),
  hs('div',{className:'at-hero-map',children:[
   hs('svg',{viewBox:value$3.viewBox,role:'img','aria-label':'Mapa do Brasil com os emplacamentos por município',children:[
    value$3.features.map(f=>h('path',{d:f.path,className:'at-hero-uf'},f.uf)),
    dots.map(d=>h('circle',{cx:d.x,cy:d.y,r:radius(d.v).toFixed(1),className:d===top?'at-hero-dot at-hero-top':'at-hero-dot',children:h('title',{children:d.name+' · '+d.uf+': '+number(d.v)})},d.code))
   ]}),
   top&&hs('div',{className:'at-hero-annotation',children:[h('span',{children:top.name}),h('button',{type:'button',onClick:()=>onTerritory?.(top.uf),children:number(top.v)+' · explorar território ⟶'})]})
  ]})
 ]});
}
