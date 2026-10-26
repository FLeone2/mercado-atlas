import { useEffect, useMemo, useRef, useState } from 'react';
import { useAtlas } from './ctx.js';
import { label, list, brandName, monthLabel, monthEnd, presets, rangeText, UF_NAMES, FOCUS_DEFAULT, fmt, versionLabel } from './lib.js';

/* Barra de filtros fixa: cada botão mostra o valor escolhido e abre um painel curto.
   Território em cascata (região → estado → município), marca em foco separada do recorte. */
const REGIOES = { Norte: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'], Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'], 'Centro-Oeste': ['DF', 'GO', 'MS', 'MT'], Sudeste: ['ES', 'MG', 'RJ', 'SP'], Sul: ['PR', 'RS', 'SC'] };
const PROPULSAO = ['ICE', 'MHEV', 'HEV', 'PHEV', 'BEV'];
const MORE = [['segmento', 'Tipo de veículo'], ['bd_carroceria', 'Carroceria'], ['combustivel', 'Combustível'], ['grupo_modelo', 'Modelo'], ['modelo', 'Versão'], ['bd_origem', 'Origem do veículo'], ['ano_fabricacao', 'Ano de fabricação']];
const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const NONE = /classific|correspond|informado|indeterm|^outros$/i;

function Chips({ options, value, onChange, single }) {
  const sel = list(value);
  const toggle = k => onChange(single ? (sel[0] === k ? [] : [k]) : sel.includes(k) ? sel.filter(x => x !== k) : [...sel, k]);
  return <div className="nx-chips">{options.map(([k, text, n]) => <button key={k} type="button" className="nx-chip" aria-pressed={sel.includes(k)} onClick={() => toggle(k)}>{text}{n > 0 && <small className="px-n">{fmt(n)}</small>}</button>)}</div>;
}

function Search({ choices, value, onChange, show, rank, placeholder, single, limit = 8 }) {
  const [q, setQ] = useState(''), sel = list(value);
  const found = useMemo(() => {
    const t = fold(q.trim()); if (!t) return [];
    return choices.filter(c => !sel.includes(c) && (fold(show(c)).includes(t) || fold(c).includes(t))).sort((a, b) => (rank.get(b) ?? 0) - (rank.get(a) ?? 0)).slice(0, limit);
  }, [q, choices, sel, show, rank, limit]);
  const add = k => { onChange(single ? [k] : [...sel, k]); setQ(''); };
  return (
    <div className="px-search">
      {!single && sel.length > 0 && <div className="nx-chips">{sel.map(k => <button key={k} type="button" className="nx-chip on" onClick={() => onChange(sel.filter(x => x !== k))} aria-label={'Remover ' + show(k)}>{show(k)} <span aria-hidden>×</span></button>)}</div>}
      <input type="search" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && found[0]) add(found[0]); }} placeholder={placeholder} aria-label={placeholder} />
      {q.trim() && (found.length ? <ul className="nx-found">{found.map(c => <li key={c}><button type="button" onClick={() => add(c)}>{show(c)}{rank.get(c) > 0 && <small>{fmt(rank.get(c))}</small>}</button></li>)}</ul> : <p className="nx-none">Nada encontrado</p>)}
    </div>
  );
}

function Btn({ id, k, v, on, open, setOpen }) {
  return (
    <button type="button" className={'px-fbtn' + (on ? ' on' : '') + (id === 'foco' ? ' focus' : '')} aria-expanded={open === id} onClick={() => setOpen(o => (o === id ? null : id))}>
      <small>{k}</small><span>{v}</span>
      <svg viewBox="0 0 12 8" aria-hidden><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
    </button>
  );
}
const Pop = ({ id, children, wide, open }) => open === id && <div className={'px-pop' + (wide ? ' wide' : '')} role="dialog" aria-label="Filtro">{children}</div>;

export default function FilterBar() {
  const { filters, setFilter, reset, market, manifest, focus, cityName } = useAtlas();
  const [open, setOpen] = useState(null), bar = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = e => { if (!bar.current?.contains(e.target)) setOpen(null); }, esc = e => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const months = useMemo(() => (manifest?.months ?? []).filter(m => m.cubePath).map(m => m.month), [manifest]);
  const latest = months.at(-1), choices = manifest?.dimensionChoices ?? {};
  const ranks = useMemo(() => Object.fromEntries(Object.entries(market?.groups ?? {}).map(([k, rows]) => [k, new Map(rows.map(r => [r.name, r.count]))])), [market]);
  const rank = id => ranks[id] ?? new Map();
  // versões: "Triton HPE AT4 · Mitsubishi" (o registro original continua buscável)
  const vinfo = useMemo(() => new Map((market?.versionInfo ?? []).map(r => [r.modelo, r])), [market]);
  const showVersion = v => { const i = vinfo.get(v); return i ? versionLabel(v, i.grupo_modelo) + ' · ' + brandName(i.marca) : v; };
  const set = id => v => setFilter(id, v.length ? v : 'all');
  const opts = (id, keys) => keys.filter(k => !NONE.test(k)).map(k => [k, label(id, k), rank(id).get(k) ?? 0]).sort((a, b) => b[2] - a[2]);

  /* período */
  const date = String(filters.date ?? ''), [a, b] = date.split('..').map(s => s?.slice(0, 7));
  const setRange = (from, to) => { if (from > to) to = from; setFilter('date', from + '-01..' + monthEnd(to)); };
  const periodText = market?.requestedRange ? rangeText(market.requestedRange) : a ? (a === b ? monthLabel(a) : monthLabel(a) + ' a ' + monthLabel(b)) : 'Período';

  /* território em cascata: escolher região limpa estados de fora; escolher estado limpa municípios de fora */
  const regs = list(filters.regiao), ufs = list(filters.uf), cities = list(filters.municipio);
  const ufChoices = (regs.length ? regs.flatMap(r => REGIOES[r] ?? []) : Object.keys(UF_NAMES)).filter(u => UF_NAMES[u]);
  const setRegs = v => { setFilter('regiao', v.length ? v : 'all'); const allowed = v.flatMap(r => REGIOES[r]); const keep = ufs.filter(u => !v.length || allowed.includes(u)); if (keep.length !== ufs.length) { setFilter('uf', keep.length ? keep : 'all'); setFilter('municipio', 'all'); } };
  const setUfs = v => { setFilter('uf', v.length ? v : 'all'); if (cities.length) setFilter('municipio', 'all'); };
  const cityRows = useMemo(() => (market?.groups?.municipio ?? []).filter(r => { const u = r.name.slice(r.name.lastIndexOf(' · ') + 3); return !ufs.length || ufs.includes(u); }), [market, ufs]);
  const cityChoices = useMemo(() => [...new Set(cityRows.map(r => r.name.slice(0, r.name.lastIndexOf(' · '))))], [cityRows]);
  const cityRank = useMemo(() => { const m = new Map(); for (const r of cityRows) { const n = r.name.slice(0, r.name.lastIndexOf(' · ')); m.set(n, (m.get(n) ?? 0) + r.count); } return m; }, [cityRows]);
  const showCity = c => cityName(c, ufs.length === 1 ? ufs[0] : (cityRows.find(r => r.name.startsWith(c + ' · '))?.name.slice(-2) ?? ''));
  const placeText = cities.length ? cities.map(showCity).join(', ') : ufs.length ? (ufs.length > 2 ? ufs.length + ' estados' : ufs.map(u => UF_NAMES[u]).join(', ')) : regs.length ? regs.join(', ') : 'Brasil';

  const valueText = (id, fallback) => { const v = list(filters[id]); return v.length ? (v.length > 2 ? v.length + ' escolhidos' : v.map(x => label(id, x)).join(', ')) : fallback; };
  const moreOn = MORE.filter(([id]) => list(filters[id]).length).length + (filters.population === 'all_content' ? 1 : 0);
  const changed = filters.population === 'all_content' || Object.entries(filters).some(([k, v]) => !['date', 'population'].includes(k) && list(v).length) || (latest && date !== latest + '-01..' + monthEnd(latest));
  const brandChoices = useMemo(() => (choices.marca ?? []).filter(x => !NONE.test(x)), [choices.marca]);

  const bp = { open, setOpen };
  return (
    <div className="px-fbar" ref={bar}>
      <div className="px-fbar-in nx-wrap">
        <div className="px-fgroup">
          <Btn {...bp} id="periodo" k="Período" v={periodText} />
          <Pop open={open} id="periodo">
            <h4>Atalhos</h4>
            <div className="nx-chips">{presets(latest).map(([l, v]) => <button key={l} type="button" className="nx-chip" aria-pressed={date === v} onClick={() => { setFilter('date', v); setOpen(null); }}>{l}</button>)}</div>
            {months.length > 0 && <><h4>Meses</h4><div className="nx-range">
              <label>De<select value={a ?? ''} onChange={e => setRange(e.target.value, b ?? e.target.value)}>{[...months].reverse().map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
              <label>até<select value={b ?? ''} onChange={e => setRange(a ?? e.target.value, e.target.value)}>{[...months].reverse().filter(m => m >= (a ?? months[0])).map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
            </div></>}
            <p className="px-pop-note">Os gráficos de trajetória mostram sempre os meses anteriores até o fim deste período.</p>
          </Pop>
        </div>
        <div className="px-fgroup">
          <Btn {...bp} id="territorio" k="Território" v={placeText} on={regs.length || ufs.length || cities.length} />
          <Pop open={open} id="territorio" wide>
            <h4>Região</h4><Chips options={Object.keys(REGIOES).map(r => [r, r])} value={filters.regiao} onChange={setRegs} />
            <h4>Estado</h4><Chips options={ufChoices.map(u => [u, UF_NAMES[u], rank('uf').get(u) ?? 0]).sort((x, y) => y[2] - x[2]).map(([k, t]) => [k, t])} value={filters.uf} onChange={setUfs} />
            <h4>Município{ufs.length ? ' · ' + (ufs.length === 1 ? UF_NAMES[ufs[0]] : ufs.join(', ')) : ''}</h4>
            <Search choices={cityChoices} value={filters.municipio} onChange={set('municipio')} show={showCity} rank={cityRank} placeholder={ufs.length ? 'Buscar município' : 'Buscar município (escolha um estado para filtrar a lista)'} />
          </Pop>
        </div>
        <div className="px-fgroup">
          <Btn {...bp} id="foco" k="Marca em foco" v={brandName(focus)} />
          <Pop open={open} id="foco">
            <p className="px-pop-note first">A marca em foco é destacada e comparada com o mercado em todas as páginas. Ela não recorta o mercado.</p>
            <Chips single options={(market?.groups?.marca ?? []).slice(0, 14).map(r => [r.name, brandName(r.name)])} value={[focus]} onChange={v => { setFilter('marca', v.length && v[0] !== FOCUS_DEFAULT ? v : 'all'); setOpen(null); }} />
            <Search single choices={brandChoices} value={[focus]} onChange={v => { setFilter('marca', v[0] && v[0] !== FOCUS_DEFAULT ? v : 'all'); setOpen(null); }} show={brandName} rank={rank('marca')} placeholder="Buscar marca" />
            {focus !== FOCUS_DEFAULT && <button type="button" className="px-link" onClick={() => { setFilter('marca', 'all'); setOpen(null); }}>Voltar para Mitsubishi</button>}
          </Pop>
        </div>
        <div className="px-fgroup">
          <Btn {...bp} id="porte" k="Porte" v={valueText('bd_segmento', 'Todos')} on={list(filters.bd_segmento).length} />
          <Pop open={open} id="porte" wide><Chips options={opts('bd_segmento', choices.bd_segmento ?? []).filter(o => o[2] > 0 || list(filters.bd_segmento).includes(o[0])).map(([k, t]) => [k, t])} value={filters.bd_segmento} onChange={set('bd_segmento')} /></Pop>
        </div>
        <div className="px-fgroup">
          <Btn {...bp} id="propulsao" k="Propulsão" v={valueText('propulsao', 'Todas')} on={list(filters.propulsao).length} />
          <Pop open={open} id="propulsao"><Chips options={PROPULSAO.map(k => [k, label('propulsao', k)])} value={filters.propulsao} onChange={set('propulsao')} /></Pop>
        </div>
        <div className="px-fgroup">
          <Btn {...bp} id="canal" k="Canal" v={valueText('tipo_venda', 'Todos')} on={list(filters.tipo_venda).length} />
          <Pop open={open} id="canal"><Chips options={[['VAREJO', 'Varejo'], ['VD', 'Venda direta']]} value={filters.tipo_venda} onChange={set('tipo_venda')} /><p className="px-pop-note">Venda direta inclui locadoras, frotistas, produtor rural, PcD e governo.</p></Pop>
        </div>
        <div className="px-fgroup">
          <Btn {...bp} id="mais" k="Mais filtros" v={moreOn ? moreOn + ' ativo' + (moreOn > 1 ? 's' : '') : 'Nenhum'} on={moreOn} />
          <Pop open={open} id="mais" wide>
            {MORE.map(([id, t]) => (
              <section key={id}><h4>{t}</h4>
                {(choices[id] ?? []).length <= 14
                  ? <Chips options={opts(id, choices[id] ?? []).map(([k, l]) => [k, l])} value={filters[id]} onChange={set(id)} />
                  : <Search choices={(choices[id] ?? []).filter(x => !NONE.test(x))} value={filters[id]} onChange={set(id)} show={id === 'modelo' ? showVersion : x => label(id, x)} rank={rank(id)} placeholder={'Buscar ' + t.toLowerCase()} />}
              </section>
            ))}
            <section><h4>Universo</h4><Chips single options={[['light', 'Automóveis + comerciais leves'], ['all_content', 'Todo o conteúdo dos arquivos']]} value={[filters.population ?? 'light']} onChange={v => setFilter('population', v[0] ?? 'light')} /></section>
          </Pop>
        </div>
        {changed && <button type="button" className="px-clear" onClick={() => { reset(); setOpen(null); }}>Limpar</button>}
      </div>
    </div>
  );
}
