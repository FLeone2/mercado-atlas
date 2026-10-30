import { useAtlas } from './ctx.js';
import { fmt, pct, pp, signed, standing, label } from './lib.js';
import { Num } from './base/motion.js';

/* Cabeçalho de página: título, recorte em uma linha e o índice das seções (âncoras, nunca abas). */
export function PageHead({ title, toc = [], strip = true }) {
  const { scope } = useAtlas();
  const jump = id => document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  return (
    <header className="px-head nx-wrap">
      <h1>{title}</h1>
      <p className="px-scope">{scope}</p>
      {toc.length > 0 && <nav className="px-toc" aria-label="Nesta página">{toc.map(([id, t]) => <button key={id} type="button" onClick={() => jump(id)}>{t}</button>)}</nav>}
      {strip && <FocusStrip />}
    </header>
  );
}

/* Números da marca em foco no recorte, sempre ao lado do mercado. */
export function useFocusStats() {
  const { market, focus } = useAtlas();
  if (!market?.focus) return null;
  const f = market.focus, now = standing(market.groups?.marca, focus), before = standing(market.yearGroups?.marca, focus);
  const share = market.total > 0 ? f.total / market.total : 0, shareYear = market.year > 0 && f.year != null ? f.year / market.year : null;
  const seg = (f.groups?.bd_segmento ?? []).find(r => r.count > 0), segMarket = seg ? (market.groups?.bd_segmento ?? []).find(r => r.name === seg.name)?.count ?? 0 : 0;
  return {
    total: f.total, year: f.year, change: f.yearChangeRate, marketChange: market.yearChangeRate,
    share, shareChange: shareYear == null ? null : share - shareYear, rank: now.rank, rankYear: before.rank, brands: now.rows.length,
    seg: seg ? { name: seg.name, label: label('bd_segmento', seg.name), share: segMarket > 0 ? seg.count / segMarket : 0, ofBrand: f.total > 0 ? seg.count / f.total : 0 } : null,
  };
}
const tone = x => (x == null || Math.abs(x) < 1e-4 ? '' : x > 0 ? 'up' : 'down');

export function FocusStrip() {
  const { focusName, pending, market } = useAtlas(), s = useFocusStats();
  if (!s) return <div className="px-strip" aria-busy><span className="px-strip-k">{focusName}</span><span className="px-strip-wait">{pending || !market ? 'Calculando…' : 'Sem emplacamentos da marca neste recorte'}</span></div>;
  const moved = s.rank && s.rankYear ? s.rankYear - s.rank : null;
  return (
    <div className="px-strip" role="group" aria-label={'Placar de ' + focusName}>
      <span className="px-strip-k">{focusName}</span>
      <span><b><Num value={s.total} format={fmt} /></b> emplacamentos <i className={tone(s.change)}>{signed(s.change)}</i><small>mercado {signed(s.marketChange)}</small></span>
      <span><b><Num value={s.share} format={v => pct(v, 2)} /></b> do mercado <i className={tone(s.shareChange)}>{pp(s.shareChange, 2)}</i></span>
      <span><b>{s.rank ? s.rank + 'ª' : '—'}</b> marca{moved ? <i className={tone(moved)}>{moved > 0 ? '▲ ' + moved : '▼ ' + -moved}</i> : null}<small>de {s.brands}</small></span>
      {s.seg && <span><b><Num value={s.seg.share} format={v => pct(v, 1)} /></b> de {s.seg.label.toLowerCase()}<small>{pct(s.seg.ofBrand, 0)} das vendas da marca</small></span>}
    </div>
  );
}

/* Seção de página: âncora + título curto + grade de cartões. */
export function Section({ id, title, sub, children }) {
  return (
    <section className="px-sec nx-wrap" id={id}>
      {(title || sub) && <div className="px-sec-head">{title && <h2>{title}</h2>}{sub && <p>{sub}</p>}</div>}
      <div className="nx-grid">{children}</div>
    </section>
  );
}

/* Filtros que um bloco não consegue aplicar, ditos em texto curto (nunca ignorados em silêncio). */
export const Scope = ({ ignored, extra }) => (ignored?.length || extra ? <p className="px-scopenote">{ignored?.length ? 'Sem ' + ignored.join(', ').toLowerCase() + ' nesta série (o histórico mensal não tem esse detalhe). ' : ''}{extra ?? ''}</p> : null);

export const Skel = ({ h = 260 }) => <div className="px-skel" style={{ height: h }} aria-busy aria-label="Carregando" />;

/* Pílulas segmentadas */
export function Seg({ value, options, onChange, label: aria }) {
  return <div className="px-seg" role="group" aria-label={aria}>{options.map(([v, t]) => <button key={String(v)} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>{t}</button>)}</div>;
}
