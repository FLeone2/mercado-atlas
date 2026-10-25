import { useEffect, useMemo, useRef } from 'react';
import { NextCtx } from '../../next/ctx.js';
import { Contexto, Projecoes, Regional } from '../../next/areas/Economia.jsx';
import { useProto } from '../ctx.js';
import { PageHead } from '../ui.jsx';

/* Economia: o que move a compra (crédito, juros, câmbio), para onde o mercado pode ir e onde há potencial.
   Indicadores oficiais do BCB e modelos já publicados no Atlas; o que ainda falta entra listado, com a fonte. */
const NEXT = [
  ['Inadimplência e prazo do crédito de veículos', 'BCB · SGS', 'Mostra se o crédito cresce com risco controlado; prazo e entrada medem a acessibilidade da parcela.'],
  ['Renda real, massa salarial e desemprego', 'IBGE · PNAD Contínua', 'A renda explica o volume de varejo melhor que a Selic sozinha.'],
  ['Confiança do consumidor e intenção de compra', 'FGV · ICC', 'Antecipa o varejo em um a três meses.'],
  ['Agro: valor da produção, soja e boi', 'MAPA · CEPEA', 'Picapes médias (Triton) acompanham a renda do campo: MT, GO, MS, PA, TO.'],
  ['Produção, estoques e exportações', 'Anfavea', 'Estoque alto em dias de venda pressiona a venda direta e os descontos.'],
  ['Imposto de importação dos eletrificados e IPI', 'MDIC · Receita · Mover', 'Explica o ritmo dos importados e das marcas chinesas (cronograma até 35%).'],
];

export default function Economia() {
  const { base } = useProto();
  const legacy = useMemo(() => ({ base }), [base]);
  const jump = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // notas longas dos blocos de economia viram um ⓘ (o texto aparece ao passar o mouse), como no restante do site
  const root = useRef(null);
  useEffect(() => {
    const el = root.current; if (!el) return undefined; let t = 0;
    const scan = () => { for (const p of el.querySelectorAll('p.nx-note')) { const text = p.textContent.replace(/\s+/g, ' ').trim(); if (text.length > 90 && p.getAttribute('data-nxnote') !== text) { p.setAttribute('data-nxnote', text); p.setAttribute('tabindex', '0'); p.setAttribute('role', 'note'); p.setAttribute('aria-label', 'Nota: ' + text); } } };
    const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 120); }); mo.observe(el, { childList: true, subtree: true }); scan();
    return () => { mo.disconnect(); clearTimeout(t); };
  }, []);
  return (
    <div className="px-page px-econ">
      <PageHead title="Economia" toc={[['e-resumo', 'Juros, crédito e câmbio'], ['e-projecao', 'Para onde pode ir'], ['e-uf', 'Potencial regional'], ['e-proximas', 'Próximos indicadores']]} />
      <div className="nx-wrap"><p className="px-basefix"><b>Base nacional fixa:</b> indicadores e projeções do Brasil inteiro, de automóveis e comerciais leves. Os filtros do topo não se aplicam a esta página.</p></div>
      <NextCtx.Provider value={legacy}>
        <div className="nx-wrap nxo-main" ref={root}>
          <Contexto />
          <h2 className="px-econ-h">Para onde o mercado pode ir</h2>
          <Projecoes />
          <h2 className="px-econ-h">Potencial regional</h2>
          <Regional />
        </div>
      </NextCtx.Provider>
      <section className="px-sec nx-wrap" id="e-proximas">
        <div className="px-sec-head"><h2>Próximos indicadores</h2><p>O que ainda não está na base do Atlas e entra na próxima etapa da Economia, com a fonte e o porquê.</p></div>
        <div className="px-next">{NEXT.map(([t, s, why]) => <div key={t} className="px-next-i"><b>{t}</b><small>{s}</small><p>{why}</p></div>)}</div>
        <p className="px-scopenote"><button type="button" className="px-link" onClick={() => jump('e-resumo')}>Voltar ao topo da Economia</button></p>
      </section>
    </div>
  );
}
