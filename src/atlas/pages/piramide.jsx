import { useMemo, useState } from 'react';
import { engine } from 'virtual:market';
import { Block } from '../base/block.jsx';
import { useWidth } from '../base/model-charts.jsx';
import { useAtlas } from '../ctx.js';
import { Seg, Skel } from '../ui.jsx';
import { fmt, pct, signed, label } from '../lib.js';

/* Pirâmide de segmentos: um triângulo em que a ÁREA de cada faixa é o volume do segmento, do menor
   (no topo) ao maior (na base). Na profundidade t a área acumulada é t², então t = √(volume acumulado ÷ total).
   Dentro de cada faixa, a parte destacada (da esquerda) é a participação da marca em foco, das chinesas
   ou dos eletrificados naquele segmento. Dados: groups, focus.groups e segmentMix da consulta principal. */

const HIDE = /classific|correspond|informado|^---$/i;
// fora do desenho, como na pirâmide original: caminhões e categorias que não são um veículo (antigos, fora do portfólio)
const OUT = /TRUCK|BUS|^OLD$|OUT PORTFOLIO|^MID-UPPER$/;
const MIN_SHARE = .005; // faixas menores que 0,5% do mercado viram "Outros"
const ELECTRIC = ['HEV', 'PHEV', 'BEV', 'MHEV'];
const HL = { foco: 'var(--nx-accent)', chinesas: '#2a9d8f', eletrificados: '#2f6fdf' };

function geometry(rows, { x, y, width, height }) {
  const sorted = [...rows].sort((a, b) => a.total - b.total), total = sorted.reduce((s, r) => s + r.total, 0), cx = x + width / 2;
  let cum = 0;
  const bands = sorted.map(r => {
    const t0 = Math.sqrt(cum / total); cum += r.total; const t1 = Math.sqrt(cum / total);
    const top = y + height * t0, bottom = y + height * t1, lt = cx - width * t0 / 2, rt = cx + width * t0 / 2, lb = cx - width * t1 / 2, rb = cx + width * t1 / 2;
    const slice = (a, b) => [[lt + (rt - lt) * a, top], [lt + (rt - lt) * b, top], [lb + (rb - lb) * b, bottom], [lb + (rb - lb) * a, bottom]];
    const depth = t0 + t1 ? (2 / 3) * (t1 * t1 + t1 * t0 + t0 * t0) / (t1 + t0) : 0; // centro de área da faixa
    return { ...r, top, bottom, poly: slice(0, 1), partPoly: slice(0, Math.min(1, r.part ?? 0)), cy: y + height * depth, lx: cx - width * depth / 2, rx: cx + width * depth / 2 };
  });
  return { bands, total, outline: [[cx, y], [x + width, y + height], [x, y + height]] };
}
const pts = p => p.map(q => q.map(v => v.toFixed(1)).join(',')).join(' ');

function Pyramid({ rows, color, partLabel, onPick }) {
  const [ref, w] = useWidth(), { tip } = useAtlas(), [hot, setHot] = useState(null);
  const W = Math.max(320, w || 1000), compact = W < 700, left = compact ? 118 : 220, right = compact ? 92 : 190, gap = compact ? 34 : 36;
  const H = Math.max(compact ? 360 : 440, rows.length * gap + 40), top = 34, frame = { x: left + 10, y: top, width: Math.max(80, W - left - right - 20), height: H };
  const g = useMemo(() => geometry(rows, frame), [rows, W]); // eslint-disable-line react-hooks/exhaustive-deps
  // rótulos: na altura do centro de cada faixa, empurrados para não se sobreporem (as áreas não mudam)
  const labels = useMemo(() => {
    const out = g.bands.map(b => ({ b, y: b.cy }));
    for (let i = 1; i < out.length; i++) out[i].y = Math.max(out[i].y, out[i - 1].y + gap * .62);
    const max = top + H + 8; if (out.length && out.at(-1).y > max) { out.at(-1).y = max; for (let i = out.length - 2; i >= 0; i--) out[i].y = Math.min(out[i].y, out[i + 1].y - gap * .62); }
    return out;
  }, [g, gap, H]);
  const show = (e, b) => { setHot(b.key); tip.show(e, <><strong>{b.label}</strong><span><b>{fmt(b.total)}</b> emplacamentos · {pct(b.total / g.total, 1)} do mercado</span><span>{partLabel}: <b>{pct(b.part, 1)}</b> ({fmt(b.partCount)})</span>{b.change != null && <span>Em um ano: <b>{signed(b.change, 0)}</b></span>}{onPick && <span>Clique para filtrar o site por este segmento</span>}</>); };
  return (
    <div ref={ref} className="px-pyr" onMouseLeave={() => { setHot(null); tip.hide(); }}>
      <svg width={W} height={H + top + 26} role="img" aria-label={'Pirâmide de segmentos com ' + partLabel}>
        <text x={0} y={16} className="px-pyr-col">Segmento</text>
        <text x={W} y={16} className="px-pyr-col" textAnchor="end">Do mercado · {partLabel}</text>
        {g.bands.map(b => {
          const on = hot === b.key;
          return (
            <g key={b.key} className={'px-pyr-b' + (hot && !on ? ' dim' : '')} onMouseMove={e => show(e, b)} onClick={() => onPick?.(b.key)} style={{ cursor: onPick ? 'pointer' : 'default' }}>
              <polygon points={pts(b.poly)} fill="#e3e3e8" />
              {b.part > 0 && <polygon points={pts(b.partPoly)} fill={color} />}
              <line x1={b.poly[0][0]} x2={b.poly[1][0]} y1={b.top} y2={b.top} stroke="#fff" strokeWidth="1.2" />
              {on && <polygon points={pts(b.poly)} fill="none" stroke="#1d1d1f" strokeWidth="2" />}
            </g>
          );
        })}
        <polygon points={pts(g.outline)} fill="none" stroke="rgba(0,0,0,.12)" />
        {labels.map(({ b, y }) => (
          <g key={b.key} className={'px-pyr-l' + (hot === b.key ? ' on' : '')} onMouseMove={e => show(e, b)}>
            <path d={`M${left},${y} L${b.lx - 4},${b.cy}`} className="px-pyr-lead" />
            <text x={0} y={y + 4}>{b.label}</text>
            <path d={`M${b.rx + 4},${b.cy} L${W - right + (compact ? -4 : 20)},${y}`} className="px-pyr-lead" />
            <text x={W - (compact ? 50 : 64)} y={y + 4} textAnchor="end" className="px-pyr-v">{pct(b.total / g.total, 1)}</text>
            <text x={W} y={y + 4} textAnchor="end" className="px-pyr-p" style={{ fill: color }}>{pct(b.part, 1)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function Piramide() {
  const { market, focus, focusName, setFilter, mFilters } = useAtlas(), sel = engine.useChineseSelection();
  const [dim, setDim] = useState('bd_segmento'), [what, setWhat] = useState('foco');
  const d = useMemo(() => {
    const groups = market?.groups?.[dim]; if (!groups) return null;
    const year = new Map((market.yearGroups?.[dim] ?? []).map(r => [r.name, r.count])), mix = market.segmentMix?.[dim];
    const part = new Map();
    if (what === 'foco') for (const r of market.focus?.groups?.[dim] ?? []) part.set(r.name, r.count);
    else if (mix) for (const r of what === 'chinesas' ? mix.marca.filter(x => engine.isChineseBrand(x.marca, sel)) : mix.propulsao.filter(x => ELECTRIC.includes(x.propulsao))) part.set(r.seg, (part.get(r.seg) ?? 0) + r.count);
    const all = groups.filter(r => r.count > 0), out = r => HIDE.test(r.name) || OUT.test(r.name), hidden = all.filter(out).reduce((s, r) => s + r.count, 0);
    const kept = all.filter(r => !out(r)), sum = kept.reduce((s, r) => s + r.count, 0), small = kept.filter(r => r.count / sum < MIN_SHARE);
    const row = (key, name, list) => { const t = list.reduce((s, r) => s + r.count, 0), pc = list.reduce((s, r) => s + (part.get(r.name) ?? 0), 0), y0 = list.reduce((s, r) => s + (year.get(r.name) ?? 0), 0); return { key, codes: list.map(r => r.name), label: name, total: t, partCount: pc, part: t > 0 ? pc / t : 0, change: y0 > 0 ? t / y0 - 1 : null }; };
    const rows = kept.filter(r => !small.includes(r)).map(r => row(r.name, label(dim, r.name), [r]));
    if (small.length) rows.push(row('outros', (dim === 'bd_segmento' ? 'Outros portes' : 'Outras carrocerias') + ' (' + small.length + ')', small));
    const pc = rows.reduce((s, r) => s + r.partCount, 0), tot = rows.reduce((s, r) => s + r.total, 0);
    const best = [...rows].filter(r => r.total / tot >= .02).sort((a, b) => b.part - a.part)[0];
    return { rows, hidden, share: tot > 0 ? pc / tot : 0, best, base: rows.length ? [...rows].sort((a, b) => b.total - a.total)[0] : null };
  }, [market, dim, what, sel]);
  const partLabel = what === 'foco' ? focusName : what === 'chinesas' ? 'chinesas' : 'eletrificados';
  const filtered = Array.isArray(mFilters[dim]) && mFilters[dim].length > 0;
  return (
    <Block className="nx-c12" title={'Pirâmide de ' + (dim === 'bd_segmento' ? 'portes' : 'carrocerias')}
      sub={d?.base ? <>{d.base.label} é a base ({pct(d.base.total / d.rows.reduce((s, r) => s + r.total, 0), 0)} do mercado) · {partLabel} {what === 'foco' ? 'tem' : 'têm'} <em style={{ color: HL[what] }}>{pct(d.share, 1)}</em> do recorte{d.best ? <>, mais forte em {d.best.label.toLowerCase()} ({pct(d.best.part, 1)})</> : ''}</> : null}
      info="A área de cada faixa é proporcional aos emplacamentos do segmento: do menor, no topo, ao maior, na base (a altura não é linear). A parte colorida de cada faixa é a participação escolhida dentro daquele segmento. À direita: participação do segmento no mercado do recorte e a participação destacada. Clique numa faixa para filtrar o site por ela."
      actions={<div className="px-ctl">
        <Seg label="Agrupar por" value={dim} onChange={setDim} options={[['bd_segmento', 'Porte'], ['bd_carroceria', 'Carroceria']]} />
        <Seg label="Destacar" value={what} onChange={setWhat} options={[['foco', focusName], ['chinesas', 'Marcas chinesas'], ['eletrificados', 'Eletrificados']]} />
      </div>}>
      {!d ? <Skel h={460} /> : !d.rows.length ? <p className="px-scopenote">Sem emplacamentos classificados neste recorte.</p> : <Pyramid rows={d.rows} color={HL[what]} partLabel={partLabel} onPick={filtered ? null : k => setFilter(dim, d.rows.find(r => r.key === k)?.codes ?? [k])} />}
      {d?.hidden > 0 && <p className="px-scopenote">{fmt(d.hidden)} emplacamentos de caminhões leves, categorias sem {dim === 'bd_segmento' ? 'porte' : 'carroceria'} ou fora do portfólio ficam fora do desenho (continuam no total do site). Faixas com menos de 0,5% do mercado estão juntas em “Outros”.</p>}
    </Block>
  );
}
