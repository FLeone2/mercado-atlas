import { useMemo, useState } from 'react';
import { Block } from '../base/block.jsx';
import { useAtlas } from '../ctx.js';
import { Scope, Seg, Skel } from '../ui.jsx';
import { Lines } from '../charts.jsx';
import { fmt, pct, pp, signed, label, monthLabel, SHORT_MONTH, historyGroup, ignoredBy, lastCompleteIndex } from '../lib.js';

/* A marca em foco nos seus segmentos, mês a mês, sempre ao lado do próprio segmento e do mercado:
   crescimento sobre o mês anterior, sobre o mesmo mês do ano anterior, ou participação.
   Histórico mensal (meses completos), com os filtros do site que o histórico aplica. */

const MEASURES = [['mom', 'Sobre o mês anterior'], ['yoy', 'Sobre o mesmo mês do ano anterior'], ['share', 'Participação']];
const LAG = { mom: 1, yoy: 12 };
const growth = (a, i, lag) => (a && i - lag >= 0 && a[i - lag] > 0 ? a[i] / a[i - lag] - 1 : null);
const share = (a, b, i) => (a && b && b[i] > 0 ? a[i] / b[i] : null);
const tone = x => (x == null || Math.abs(x) < 1e-6 ? '' : x > 0 ? 'up' : 'down');
// variação inteira, sem "−0%" para quedas de menos de meio ponto
const g0 = v => (v != null && Math.abs(v) < .005 ? '0%' : signed(v, 0));

export default function FocoMensal() {
  const { market, focus, focusName, hist, mFilters } = useAtlas();
  const [pick, setPick] = useState(null), [measure, setMeasure] = useState('mom');
  const base = useMemo(() => {
    const f = market?.focus; if (!f?.groups?.bd_segmento || !hist.data) return null;
    const segs = f.groups.bd_segmento.filter(r => r.count > 0 && f.total > 0 && r.count / f.total >= .05 && !/classific|correspond/i.test(r.name)).slice(0, 4).map(r => r.name);
    const gs = historyGroup(hist.data, mFilters, ['bd_segmento', 'marca']), gt = historyGroup(hist.data, mFilters, ['bd_segmento']), gb = historyGroup(hist.data, mFilters, ['marca']);
    if (!gs || !gt || !gb) return null;
    const i1 = lastCompleteIndex(gt, market.range?.end?.slice(0, 7));
    // cada linha: a marca, a referência (segmento ou, no total, o mercado) e o mercado
    const rows = [{ key: 'total', name: 'Total da marca', brand: gb.by.get(focus), ref: null }, ...segs.map(s => ({ key: s, name: label('bd_segmento', s), brand: gs.by.get(s + '|' + focus), ref: gt.by.get(s) }))];
    return { rows, months: gt.months, market: gt.total, i1 };
  }, [market, hist.data, mFilters, focus]);
  const seg = pick && base?.rows.some(r => r.key === pick) ? pick : base?.rows[1]?.key ?? 'total';
  const row = base?.rows.find(r => r.key === seg);

  const chart = useMemo(() => {
    if (!base || !row) return null;
    const { i1, months, market: mk } = base, i0 = Math.max(measure === 'share' ? 0 : LAG[measure], i1 - 23), ix = Array.from({ length: i1 - i0 + 1 }, (_, k) => i0 + k);
    const segName = row.key === 'total' ? '' : ' em ' + row.name.toLowerCase();
    if (measure === 'share') {
      const series = [...(row.ref ? [{ name: 'No segmento', values: ix.map(i => share(row.brand, row.ref, i)), color: 'var(--nx-accent)', width: 3.2 }] : []), { name: 'No mercado', values: ix.map(i => share(row.brand, mk, i)), color: row.ref ? '#8e8e93' : 'var(--nx-accent)', width: row.ref ? 2 : 3.2, dash: row.ref ? '5 4' : undefined }];
      return { months: ix.map(i => months[i]), series, segName };
    }
    const lag = LAG[measure];
    const series = [{ name: focusName, values: ix.map(i => growth(row.brand, i, lag)), color: 'var(--nx-accent)', width: 3.2 }, ...(row.ref ? [{ name: 'Segmento', values: ix.map(i => growth(row.ref, i, lag)), color: 'var(--nx-ink)', width: 2.2 }] : []), { name: 'Mercado', values: ix.map(i => growth(mk, i, lag)), color: '#8e8e93', width: 2, dash: '5 4' }];
    return { months: ix.map(i => months[i]), series, segName };
  }, [base, row, measure, focusName]);

  // tabela: últimos 12 meses completos, uma linha por segmento (e o total), a marca contra a referência
  const table = useMemo(() => {
    if (!base) return null;
    const { i1, months, market: mk } = base, cols = Array.from({ length: 12 }, (_, k) => i1 - 11 + k).filter(i => i >= 0);
    const cell = (r, i) => {
      if (measure === 'share') { const s = r.ref ? share(r.brand, r.ref, i) : share(r.brand, mk, i), s0 = r.ref ? share(r.brand, r.ref, i - 1) : share(r.brand, mk, i - 1); return { v: s, ref: s != null && s0 != null ? s - s0 : null, diff: s != null && s0 != null ? s - s0 : null, n: r.brand?.[i] ?? 0 }; }
      const lag = LAG[measure], v = growth(r.brand, i, lag), ref = growth(r.ref ?? mk, i, lag);
      return { v, ref, diff: v != null && ref != null ? v - ref : null, n: r.brand?.[i] ?? 0 };
    };
    return { cols: cols.map(i => months[i]), rows: base.rows.map(r => ({ ...r, cells: cols.map(i => cell(r, i)) })) };
  }, [base, measure]);

  if (!base) return <div className="nx-c12"><Skel h={520} /></div>;
  const last = table.rows.find(r => r.key === seg)?.cells.at(-1), lastMonth = table.cols.at(-1);
  const refWord = row.key === 'total' ? 'o mercado' : 'o segmento';
  const sub = !last || last.v == null ? null : measure === 'share'
    ? <>Em {monthLabel(lastMonth)}: <em>{pct(last.v, 1)}</em> {row.key === 'total' ? 'do mercado' : 'de ' + row.name.toLowerCase()} ({pp(last.diff, 1)} sobre o mês anterior)</>
    : <>Em {monthLabel(lastMonth)}{chart.segName}: <em className={tone(last.v)}>{g0(last.v)}</em> {measure === 'mom' ? 'sobre o mês anterior' : 'sobre o mesmo mês do ano anterior'}, contra {g0(last.ref)} {refWord.replace(/^o /, 'do ')}{last.diff != null ? <> ({(Math.abs(last.diff) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} p.p. {last.diff >= 0 ? 'acima' : 'abaixo'})</> : ''}</>;
  const fmtG = v => signed(v, 0), fmtS = v => pct(v, 1);
  return <>
    <Block className="nx-c12" title={focusName + (row.key === 'total' ? ' × mercado' : ' × segmento × mercado') + ', mês a mês'} sub={sub}
      info="Crescimento sobre o mês anterior sofre com o número de dias úteis e a sazonalidade (dezembro e março são altos, fevereiro é baixo); o mesmo mês do ano anterior tira esse efeito. Participação: emplacamentos da marca ÷ emplacamentos do segmento (ou do mercado). Meses completos do histórico mensal."
      actions={<div className="px-ctl">
        <Seg label="Segmento" value={seg} onChange={setPick} options={base.rows.map(r => [r.key, r.key === 'total' ? 'Total da marca' : r.name])} />
        <Seg label="Medida" value={measure} onChange={setMeasure} options={MEASURES} />
      </div>}>
      <Lines months={chart.months} series={chart.series} fmtY={measure === 'share' ? fmtS : fmtG} fmtTip={measure === 'share' ? v => pct(v, 2) : v => signed(v, 1)} height={320} xFmt={SHORT_MONTH} label={focusName + ' mês a mês'} />
      <Scope ignored={ignoredBy(mFilters)} />
    </Block>
    <Block className="nx-c12" title="Os últimos 12 meses, segmento por segmento" sub={measure === 'share' ? <>Participação da {focusName} em cada mês · embaixo, a variação em p.p. sobre o mês anterior</> : <>{measure === 'mom' ? 'Crescimento sobre o mês anterior' : 'Crescimento sobre o mesmo mês do ano anterior'} · embaixo, o do segmento (no total, o do mercado) · verde: a marca cresceu mais que a referência</>}>
      <div className="px-table-wrap"><table className="px-table px-mm">
        <thead><tr><th>{focusName}</th>{table.cols.map(m => <th key={m}>{SHORT_MONTH(m)}</th>)}</tr></thead>
        <tbody>{table.rows.map(r => <tr key={r.key} className={r.key === seg ? 'sel' : ''} onClick={() => setPick(r.key)}>
          <th>{r.name}</th>
          {r.cells.map((c, k) => <td key={k} className={'px-mm-c ' + tone(c.diff)} title={fmt(c.n) + ' emplacamentos'}>
            <b>{c.v == null ? '—' : measure === 'share' ? pct(c.v, 1) : g0(c.v)}</b>
            <small>{c.ref == null ? '' : measure === 'share' ? pp(c.ref, 1) : (r.ref ? 'seg. ' : 'merc. ') + g0(c.ref)}</small>
          </td>)}
        </tr>)}</tbody>
      </table></div>
      <p className="px-scopenote">Clique numa linha para ver o segmento no gráfico acima. Passe o mouse numa célula para ver o volume do mês.</p>
    </Block>
  </>;
}
