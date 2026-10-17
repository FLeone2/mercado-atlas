// "Como confiar nestes números": the first block of Dados e metodologia. Everything
// it states comes from the data manifest or from checks the repository runs.
const TRUST_MONTHS=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const trustMonth=m=>m?TRUST_MONTHS[+String(m).slice(5,7)-1]+'/'+String(m).slice(0,4):'—';
function trustFacts(manifest){
 const months=[...(manifest?.months??[])].sort((a,b)=>a.month<b.month?-1:1),channel=months.find(m=>(m.channelSourceFields??[]).length>0),bd=manifest?.bdClassification??{};
 const repeated=manifest?.totals?.repeated_plate_excess_rows??null,rows=manifest?.totals?.eligible_rows??manifest?.totals?.rows??null;
 return {start:manifest?.coverageStart,end:manifest?.coverageEnd,months:months.length,rows,generated:manifest?.generatedAt?new Date(manifest.generatedAt).toLocaleDateString('pt-BR'):'—',missing:manifest?.missingMonths??[],quarantined:manifest?.quarantinedSources??[],channelFrom:channel?.month??null,repeated,verified:manifest?.sourceAvailability?.verifiedDownloads??null,expected:manifest?.sourceAvailability?.expectedSourceFiles??null,bdJoin:bd.join??null,bdMonths:(bd.coveredMonths??[]).length};
}
function TrustGuide({manifest}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs,f=trustFacts(manifest),n=v=>v==null?'—':new Intl.NumberFormat('pt-BR').format(v);
 const card=(title,items)=>hs('article',{className:'tg-card',children:[h('h3',{children:title}),h('ul',{children:items.filter(Boolean).map((t,i)=>h('li',{children:t},i))})]},title);
 return hs('section',{className:'tg','aria-labelledby':'tg-title',children:[
  hs('header',{className:'tg-head',children:[h('h2',{id:'tg-title',children:'Como confiar nestes números'}),h('p',{children:'De onde vêm os dados, o que cada indicador mede (e o que não mede) e como o painel é conferido. Base atualizada em '+f.generated+', com dados de '+trustMonth(f.start)+' a '+trustMonth(f.end)+'.'})]}),
  hs('div',{className:'tg-grid',children:[
   card('De onde vêm',[n(f.months)+' planilhas mensais de emplacamentos de automóveis e comerciais leves, uma por mês, sem mês faltando'+(f.missing.length?' (exceto '+f.missing.join(', ')+')':'')+'.',n(f.rows)+' registros no total; cada linha da fonte conta uma vez.',f.verified!=null?n(f.verified)+' de '+n(f.expected)+' arquivos de origem conferidos no download.':null,'Economia usa séries oficiais do Banco Central e população do IBGE, com a fonte em cada número.']),
   card('O que os números medem',['Emplacamento é o registro de um veículo novo, na data do registro. Não é venda faturada nem frota em circulação.','Participação = parte do recorte escolhido nos filtros; mudar os filtros muda o universo.','Variação anual compara com o mesmo período do ano anterior. Ritmo por dia útil divide pelos dias úteis (sem fins de semana, feriados nacionais, Carnaval e Corpus Christi).','O local é o município de registro, não necessariamente o de uso: locadoras concentram registros em poucas cidades.']),
   card('O que não medem',['Preço, desconto, estoque e vendas no atacado.','Veículos usados, motos, caminhões e ônibus (fora do universo).',f.channelFrom?'Canal de venda (venda direta × varejo) só existe a partir de '+trustMonth(f.channelFrom)+'; antes disso aparece como não informado.':'Canal de venda quando a fonte não informa.','Projeções e simulações da Economia são modelos, marcados como tal; não são dados observados.']),
   card('Como o painel é conferido',['Nada é deduplicado automaticamente'+(f.repeated!=null?': '+n(f.repeated)+' placas repetidas em '+n(f.rows)+' registros ficam como na fonte':'')+'. Datas inválidas ou fora do mês ficam fora das contas.',f.bdJoin?'Classificação de porte, carroceria e tecnologia pelo código exato do modelo, sem correspondência aproximada ('+n(f.bdMonths)+' meses cobertos).':null,'Testes automáticos conferem os totais mensais contra os arquivos, o histórico de 10 anos contra os mesmos arquivos, e travam qualquer alteração nos dados feita por mudança de visual.','Categorias quase vazias (“Não classificado no BD”, “Sem correspondência BD” e propulsão “Não classificado”, juntas menos de 0,1% dos registros) ficam fora dos gráficos e tabelas, mas continuam no total e nos denominadores.','Cada área é revisada em claro, escuro e celular antes de publicar.'])
  ]})
 ]});
}
if(typeof module!=='undefined'&&module.exports)module.exports={trustFacts,trustMonth};
