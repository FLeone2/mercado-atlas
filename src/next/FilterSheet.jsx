import { useMemo, useState } from 'react';
import { engine } from 'virtual:market';
import { UF_NAMES, monthEnd, monthLabel, shiftMonth, titleCase } from './format.js';

const REGIOES = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];
const UNIVERSO = [['light', 'Automóveis + comerciais leves'], ['all_content', 'Todo o conteúdo dos arquivos']];
const NICE = { 'Álcool / Gasolina': 'Flex (álcool / gasolina)', VAREJO: 'Varejo', VD: 'Vendas diretas', Auto: 'Automóveis', 'Comercial Leve': 'Comerciais leves', LOCAL: 'Nacional', IMP: 'Importado' };
// Filtros que ficam recolhidos em "Mais filtros" (mesma lista do Atlas antigo, fora os principais)
const EXTRA = ['combustivel', 'subsegmento', 'bd_segmento', 'bd_carroceria', 'bd_classe', 'bd_macro', 'bd_combustivel', 'bd_origem', 'nacionalidade', 'ano_fabricacao', 'potencia', 'capacidade_carga', 'capacidade_passageiros'];
// grupo_modelo é o modelo (STRADA, ONIX); modelo é a versão (FIAT/STRADA ENDURAN CS13)
const LABEL = { ...engine.filterLabels, grupo_modelo: 'Modelo', modelo: 'Versão', uf: 'Estado', tipo_venda: 'Canal', nacionalidade: 'Código de nacionalidade', bd_segmento: 'Porte', bd_carroceria: 'Carroceria' };
const list = v => (v == null || v === 'all' ? [] : (Array.isArray(v) ? v : [v]).filter(x => x !== 'all'));
const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const display = id => {
  if (id === 'uf') return u => UF_NAMES[u] ?? u;
  if (id === 'marca') return n => engine.insightName(n);
  if (id === 'municipio') return n => titleCase(n);
  return v => NICE[v] ?? engine.filterChoiceLabel(id, v);
};

function Chips({ value, options, onChange, label }) {
  const sel = list(value);
  const toggle = k => onChange(sel.includes(k) ? sel.filter(x => x !== k) : [...sel, k]);
  return (
    <div className="nx-chips" role="group" aria-label={label}>
      {options.map(([k, text]) => <button key={k} type="button" className="nx-chip" aria-pressed={sel.includes(k)} onClick={() => toggle(k)}>{text}</button>)}
    </div>
  );
}

// Busca com sugestões: as opções com mais emplacamentos no recorte atual aparecem primeiro.
function Search({ id, value, choices, rank, onChange, quickCount = 5 }) {
  const [q, setQ] = useState(''), sel = list(value), show = display(id);
  const ordered = useMemo(() => [...choices].sort((a, b) => (rank.get(b) ?? -1) - (rank.get(a) ?? -1)), [choices, rank]);
  const found = useMemo(() => {
    const t = fold(q.trim());
    return t ? ordered.filter(c => !sel.includes(c) && (fold(show(c)).includes(t) || fold(c).includes(t))).slice(0, 8) : [];
  }, [q, ordered, sel]);
  const quick = ordered.filter(c => (rank.get(c) ?? 0) > 0 && !sel.includes(c)).slice(0, quickCount);
  const add = k => { onChange([...sel, k]); setQ(''); };
  const remove = k => onChange(sel.filter(x => x !== k));
  return (
    <div className="nx-search">
      <div className="nx-chips">
        {sel.map(k => <button key={k} type="button" className="nx-chip on" onClick={() => remove(k)} aria-label={'Remover ' + show(k)}>{show(k)} <span aria-hidden>×</span></button>)}
        {quick.map(k => <button key={k} type="button" className="nx-chip" onClick={() => add(k)}>{show(k)}</button>)}
      </div>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && found[0]) add(found[0]); }}
        placeholder={'Buscar ' + LABEL[id].toLowerCase()} aria-label={'Buscar ' + LABEL[id].toLowerCase()} />
      {q.trim() && (found.length > 0
        ? <ul className="nx-found">{found.map(c => <li key={c}><button type="button" onClick={() => add(c)}>{show(c)}{rank.get(c) > 0 && <small>{rank.get(c).toLocaleString('pt-BR')}</small>}</button></li>)}</ul>
        : <p className="nx-none">Nada encontrado</p>)}
    </div>
  );
}

export default function FilterSheet({ open, filters, setFilter, manifest, model, onReset, changed, palette, setPalette }) {
  const months = useMemo(() => (manifest?.months ?? []).filter(m => m.cubePath).map(m => m.month), [manifest]);
  const latest = months.at(-1), first = months[0];
  const presets = latest ? [
    ['Último mês', latest + '-01..' + monthEnd(latest)],
    ['Ano atual', latest.slice(0, 4) + '-01-01..' + monthEnd(latest)],
    ['12 meses', shiftMonth(latest, -11) + '-01..' + monthEnd(latest)],
  ] : [];
  const date = String(filters.date ?? '');
  const [a, b] = date.split('..').map(s => s?.slice(0, 7));
  const choices = manifest?.dimensionChoices ?? {};
  // contagem de cada opção no recorte atual, por filtro
  const ranks = useMemo(() => Object.fromEntries(Object.entries(model?.groups ?? {}).map(([k, rows]) => [k, new Map(rows.map(r => [r.name, r.count]))])), [model]);
  const rank = id => ranks[id] ?? new Map();
  const set = id => v => setFilter(id, v.length ? v : 'all');
  const setRange = (from, to) => { if (from > to) to = from; setFilter('date', from + '-01..' + monthEnd(to)); };
  // chips: opções com volume no recorte + as já escolhidas
  // chips: todas as opções da base, sem depender do recorte (a própria seleção nunca some)
  const chipOptions = id => (choices[id] ?? []).filter(k => list(filters[id]).includes(k) || (k !== 'Não informado' && (id !== 'segmento' || (filters.population ?? 'light') !== 'light' || ['Auto', 'Comercial Leve'].includes(k)))).map(k => [k, display(id)(k)]);
  const search = (id, extra) => <section key={id}><h4>{LABEL[id]}</h4><Search id={id} value={filters[id]} choices={id === 'uf' ? (choices.uf ?? []).filter(u => UF_NAMES[u]) : choices[id] ?? []} rank={rank(id)} onChange={set(id)} {...extra} /></section>;
  const extraOn = EXTRA.filter(id => list(filters[id]).length).length;
  // opções da própria dimensão não dependem do resultado já filtrado por ela (permite OR e nunca esconde a seleção)
  const props = ['ICE', 'MHEV', 'HEV', 'PHEV', 'BEV', 'FCEL'].map(k => [k, k]);
  const population = filters.population ?? 'light';
  return (
    <div className={'nx-sheet' + (open ? ' open' : '')} id="nx-sheet" role="dialog" aria-label="Filtros" inert={!open || undefined}>
      <section>
        <h4>Período</h4>
        <div className="nx-seg" role="group" aria-label="Atalhos de período">
          {presets.map(([label, value]) => <button key={label} type="button" aria-pressed={date === value} onClick={() => setFilter('date', value)}>{label}</button>)}
        </div>
        {months.length > 0 && (
          <div className="nx-range">
            <label>De<select value={a ?? ''} onChange={e => setRange(e.target.value, b ?? e.target.value)}>{[...months].reverse().map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
            <label>até<select value={b ?? ''} onChange={e => setRange(a ?? e.target.value, e.target.value)}>{[...months].reverse().filter(m => m >= (a ?? first)).map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
          </div>
        )}
      </section>
      <section>
        <h4>Universo</h4>
        <div className="nx-seg" role="group" aria-label="Universo">
          {UNIVERSO.map(([k, l]) => <button key={k} type="button" aria-pressed={population === k} onClick={() => setFilter('population', k)}>{l}</button>)}
        </div>
        {population === 'all_content' && <p className="nx-sheet-note">Caminhões e ônibus só existem nos arquivos de ago/2024; nos demais meses este universo é praticamente igual ao de leves. Não é uma série homogênea de todo o mercado.</p>}
      </section>
      <section><h4>Região</h4><Chips label="Região" value={filters.regiao} options={REGIOES.map(r => [r, r])} onChange={set('regiao')} /></section>
      {search('uf', { quickCount: 4 })}
      {search('municipio')}
      {search('marca', { quickCount: 6 })}
      {search('grupo_modelo', { quickCount: 6 })}
      {search('modelo')}
      {props.length > 0 && <section><h4>Propulsão</h4><Chips label="Propulsão" value={filters.propulsao} options={props} onChange={set('propulsao')} /></section>}
      <section className="nx-two">
        <div><h4>Segmento</h4><Chips label="Segmento" value={filters.segmento} options={chipOptions('segmento')} onChange={set('segmento')} /></div>
        <div><h4>Canal</h4><Chips label="Canal" value={filters.tipo_venda} options={chipOptions('tipo_venda')} onChange={set('tipo_venda')} /></div>
      </section>
      <details className="nx-more-filters" open={extraOn > 0 || undefined}>
        <summary>Mais filtros{extraOn > 0 && <span className="nx-count">{extraOn}</span>}</summary>
        {EXTRA.map(id => search(id))}
      </details>
      <div className="nx-sheet-foot">
        {changed ? <button type="button" className="nx-reset" onClick={onReset}>Limpar filtros</button> : <span>Sem filtros ativos</span>}
        <div className="nx-pal" role="group" aria-label="Paleta">
          {[['grafite', '#08090b', '#e60f2d'], ['noite', '#050b1f', '#ff9f0a'], ['branco', '#ffffff', '#ff4f2e']].map(([k, a, c]) => <button key={k} type="button" aria-label={'Paleta ' + k} aria-pressed={palette === k} onClick={() => setPalette(k)} style={{ background: `linear-gradient(135deg, ${a} 50%, ${c} 50%)` }} />)}
        </div>
      </div>
    </div>
  );
}
