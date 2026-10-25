import { PageHead } from '../ui.jsx';

/* Laboratório: ferramentas e visões especiais que não precisam estar no caminho principal da análise.
   Cada cartão abre a peça correspondente da interface anterior (?ui=atual). */
const ITEMS = [
  ['Construtor de gráficos', 'Monte o seu cruzamento: qualquer dimensão, medida e formato, com CSV.', 'explorar', 'x=construtor'],
  ['Perguntas rápidas', 'Respostas prontas para as perguntas mais comuns do dia a dia.', 'explorar', 'x=perguntas'],
  ['Animações', 'Corrida das marcas, liderança no tempo, mapas e composição do mercado em movimento.', 'animacoes', ''],
  ['Brasil em 3D', 'Espigões por município e estados em relevo.', 'territorios', ''],
  ['Simulações econômicas', 'Cenários de juros e crédito sobre os emplacamentos.', 'economia', 'e=simulacoes'],
  ['Análises técnicas', 'Defasagens, correlação pré-branqueada, coeficientes e validação dos modelos.', 'economia', 'e=tecnicas'],
  ['Conexões (Sankey e cordas)', 'Origem, canal, combustível e segmento ligados ponta a ponta.', 'concorrencia', ''],
  ['Dados e metodologia', 'Cobertura mensal, regras de classificação e como confiar nestes números.', null, 'ui=antigo&tab=quality'],
];

export default function Laboratorio() {
  const href = (area, extra) => { const p = new URLSearchParams(location.search); p.delete('a'); if (area) { p.set('ui', 'atual'); p.set('a', area); } for (const [k, v] of new URLSearchParams(extra)) p.set(k, v); return location.pathname + '?' + p.toString(); };
  return (
    <div className="px-page">
      <PageHead title="Laboratório" strip={false} />
      <section className="px-sec nx-wrap">
        <div className="px-sec-head"><p>Ferramentas para explorar além das páginas principais. Elas abrem na interface anterior do site, com os mesmos filtros.</p></div>
        <div className="px-lab">{ITEMS.map(([t, d, area, extra]) => <a key={t} className="px-lab-i" href={href(area, extra)}><b>{t}</b><p>{d}</p><span aria-hidden>↗</span></a>)}</div>
      </section>
    </div>
  );
}
