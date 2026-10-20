import { useMemo, useState } from 'react';
import { engine } from 'virtual:market';
import { UF_NAMES, monthEnd, monthLabel, shiftMonth, titleCase } from './format.js';

const REGIOES = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];
const CANAIS = [['VAREJO', 'Varejo'], ['VD', 'Vendas diretas']];
const SEGMENTOS = [['Auto', 'Automóveis'], ['Comercial Leve', 'Comerciais leves']];
const list = v => (v == null || v === 'all' ? [] : (Array.isArray(v) ? v : [v]).filter(x => x !== 'all'));
const brandName = n => engine.insightName(n);

function Chips({ value, options, onChange, label }) {
  const sel = list(value);
  const toggle = k => onChange(sel.includes(k) ? sel.filter(x => x !== k) : [...sel, k]);
  return (
    <div className="nx-chips" role="group" aria-label={label}>
      {options.map(([k, text]) => <button key={k} type="button" className="nx-chip" aria-pressed={sel.includes(k)} onClick={() => toggle(k)}>{text}</button>)}
    </div>
  );
}

function Search({ value, choices, quick, onChange, placeholder, display }) {
  const [q, setQ] = useState(''), sel = list(value);
  const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const found = useMemo(() => (q.trim() ? choices.filter(c => fold(display(c)).includes(fold(q)) && !sel.includes(c)).slice(0, 7) : []), [q, choices, sel]);
  const add = k => { onChange([...sel, k]); setQ(''); };
  const remove = k => onChange(sel.filter(x => x !== k));
  return (
    <div className="nx-search">
      <div className="nx-chips">
        {sel.map(k => <button key={k} type="button" className="nx-chip on" onClick={() => remove(k)} aria-label={'Remover ' + display(k)}>{display(k)} <span aria-hidden>×</span></button>)}
        {quick.filter(k => !sel.includes(k)).map(k => <button key={k} type="button" className="nx-chip" onClick={() => add(k)}>{display(k)}</button>)}
      </div>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {found.length > 0 && <ul className="nx-found">{found.map(c => <li key={c}><button type="button" onClick={() => add(c)}>{display(c)}</button></li>)}</ul>}
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
  const topBrands = (model?.groups?.marca ?? []).slice(0, 6).map(r => r.name);
  const props = (model?.groups?.propulsao ?? []).filter(r => r.count > 0).map(r => [r.name, r.name]);
  const set = id => v => setFilter(id, v.length ? v : 'all');
  const setRange = (from, to) => { if (from > to) to = from; setFilter('date', from + '-01..' + monthEnd(to)); };
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
      <section><h4>Região</h4><Chips label="Região" value={filters.regiao} options={REGIOES.map(r => [r, r])} onChange={set('regiao')} /></section>
      <section><h4>Estado</h4><Search value={filters.uf} choices={(choices.uf ?? []).filter(u => UF_NAMES[u])} quick={['SP', 'MG', 'PR', 'RS']} onChange={set('uf')} placeholder="Buscar estado" display={u => UF_NAMES[u] ?? u} /></section>
      <section><h4>Marca</h4><Search value={filters.marca} choices={choices.marca ?? []} quick={topBrands} onChange={set('marca')} placeholder="Buscar entre as marcas" display={brandName} /></section>
      {props.length > 0 && <section><h4>Propulsão</h4><Chips label="Propulsão" value={filters.propulsao} options={props} onChange={set('propulsao')} /></section>}
      <section className="nx-two">
        <div><h4>Segmento</h4><Chips label="Segmento" value={filters.segmento} options={SEGMENTOS} onChange={set('segmento')} /></div>
        <div><h4>Canal</h4><Chips label="Canal" value={filters.tipo_venda} options={CANAIS} onChange={set('tipo_venda')} /></div>
      </section>
      <div className="nx-sheet-foot">
        {changed ? <button type="button" className="nx-reset" onClick={onReset}>Limpar filtros</button> : <span>Sem filtros ativos</span>}
        <div className="nx-pal" role="group" aria-label="Paleta">
          {[['grafite', '#08090b', '#e60f2d'], ['noite', '#050b1f', '#ff9f0a'], ['branco', '#ffffff', '#ff4f2e']].map(([k, a, c]) => <button key={k} type="button" aria-label={'Paleta ' + k} aria-pressed={palette === k} onClick={() => setPalette(k)} style={{ background: `linear-gradient(135deg, ${a} 50%, ${c} 50%)` }} />)}
        </div>
      </div>
    </div>
  );
}
