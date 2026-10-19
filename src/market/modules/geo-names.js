/* One way to compare Brazilian municipality names across the registrations, the IBGE outlines,
   the points file and the population catalog (AT-04 of the 2026-10-19 audit).
   Rule: accents, case, punctuation and the particles DE/DO/DA/DOS/DAS/D are ignored
   (Alta Floresta D'Oeste = ALTA FLORESTA DO OESTE), then a short UF-scoped alias list covers
   renamed municipalities and old spellings. A name that still finds no match stays unmatched (N/D),
   never zero. */
const GEO_PARTICLES=new Set(['DE','DO','DA','DOS','DAS','D']);
function geoBase(value){
 return String(value??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().split(' ').filter(w=>w&&!GEO_PARTICLES.has(w)).join(' ');
}
// [UF, name in the registrations, name in the IBGE catalog]. Every target is checked against the catalog by tests/geo-names.test.cjs.
const GEO_ALIAS_PAIRS=[
 ['RJ','Campos dos Goitacazes','Campos dos Goytacazes'],['BA','Luiz Eduardo Magalhaes','Luís Eduardo Magalhães'],['SP','Embu','Embu das Artes'],
 ['RS','Santana do Livramento',"Sant'Ana do Livramento"],['SC','Picarras','Balneário Piçarras'],['RJ','Parati','Paraty'],
 ['PA','Santa Isabel do Para','Santa Izabel do Pará'],['MT','Poxoreo','Poxoréu'],['SC','Barra do Sul','Balneário Barra do Sul'],
 ['PE','Itamaraca','Ilha de Itamaracá'],['CE','Itapage','Itapajé'],['SP','Ipaucu','Ipaussu'],['MG','Brasopolis','Brazópolis'],
 ['SP','Sao Luis do Paraitinga','São Luiz do Paraitinga'],['AL','Marimbondo','Maribondo'],['MG','Itabirinha de Mantena','Itabirinha'],
 ['RJ','Trajano de Morais','Trajano de Moraes'],['BA','Livramento do Brumado','Livramento de Nossa Senhora'],['MG','Gouvea','Gouveia'],
 ['RN','Ares','Arez'],['PA','Pau Darco',"Pau D'Arco"],['TO','Pau Darco',"Pau D'Arco"],['PI','Pau Darco do Piaui',"Pau D'Arco do Piauí"],
 ['SC','Presidente Castelo Branco','Presidente Castello Branco'],['BA','Santa Teresinha','Santa Terezinha'],['AP','Amapari','Pedra Branca do Amapari'],
 ['RN','Boa Saude','Januário Cicco'],['SC','Lageado Grande','Lajeado Grande'],['RN','Lagoa Danta',"Lagoa d'Anta"],
 ['TO','Sao Valerio da Natividade','São Valério'],['MG','Queluzita','Queluzito'],['PE','Iguaraci','Iguaracy'],
 ['PB','Sao Domingos de Pombal','São Domingos'],['BA','Lagedo do Tabocal','Lajedo do Tabocal'],['PB','Santarem','Joca Claudino'],
 ['PB','Serido','São Vicente do Seridó'],['TO','Fortaleza do Tabocao','Tabocão'],['RR','Sao Luiz','São Luiz do Anauá'],
 ['AC','Santa Rosa','Santa Rosa do Purus'],['RN','Sao Miguel de Touros','São Miguel do Gostoso'],['RN','Espirito Santo do Oeste','Espírito Santo'],
 ['PB','Sao Bento de Pombal','São Bento']
];
const GEO_ALIASES=new Map(GEO_ALIAS_PAIRS.map(([uf,from,to])=>[uf+'|'+geoBase(from),geoBase(to)]));
// Comparison key. Pass the UF whenever it is known so the alias list stays scoped to that state.
function geoKey(name,uf){
 const key=geoBase(name);
 return uf?GEO_ALIASES.get(String(uf).toUpperCase()+'|'+key)??key:key;
}
if(typeof module!=='undefined'&&module.exports)module.exports={geoBase,geoKey,GEO_ALIAS_PAIRS,GEO_ALIASES,GEO_PARTICLES};
