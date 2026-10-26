import { useMemo, useState } from 'react';
import { Block } from '../base/block.jsx';
import { usePopulation } from '../base/geo.jsx';
import { useAtlas } from '../ctx.js';
import { PageHead, Section, Skel } from '../ui.jsx';
import MapaBrasil from '../MapaBrasil.jsx';
import { fmt, pct, pp, signed, UF_NAMES, rangeText } from '../lib.js';

const REG = { Norte: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'], Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'], 'Centro-Oeste': ['DF', 'GO', 'MS', 'MT'], Sudeste: ['ES', 'MG', 'RJ', 'SP'], Sul: ['PR', 'RS', 'SC'] };

export default function Territorios() {
  const { market, focus, focusName, base, setFilter } = useAtlas();
  const pop = usePopulation(base);
  const [sort, setSort] = useState('total');
  const rows = useMemo(() => {
    if (!market) return null;
    const m = market.groups?.uf ?? [], y = new Map((market.yearGroups?.uf ?? []).map(r => [r.name, r.count]));
    const f = new Map((market.focus?.groups?.uf ?? []).map(r => [r.name, r.count])), fy = new Map((market.focus?.yearGroups?.uf ?? []).map(r => [r.name, r.count]));
    const nat = market.total > 0 ? (market.focus?.total ?? 0) / market.total : 0;
    const out = m.filter(r => UF_NAMES[r.name]).map(r => {
      const share = r.count > 0 ? (f.get(r.name) ?? 0) / r.count : 0, y0 = y.get(r.name), shareY = y0 > 0 ? (fy.get(r.name) ?? 0) / y0 : null, p = pop.uf.get(r.name);
      return { uf: r.name, total: r.count, change: y0 > 0 ? r.count / y0 - 1 : null, per: p > 0 ? r.count / p * 1000 : null, focus: f.get(r.name) ?? 0, share, dShare: shareY == null ? null : share - shareY, index: nat > 0 ? share / nat : null };
    });
    const key = { total: r => r.total, change: r => r.change ?? -9, per: r => r.per ?? -1, share: r => r.share, index: r => r.index ?? -1, dShare: r => r.dShare ?? -9 }[sort];
    return out.sort((a, b) => key(b) - key(a));
  }, [market, pop.uf, sort]);
  const regions = useMemo(() => {
    if (!rows) return null;
    const all = rows.reduce((s, r) => s + r.total, 0), popAll = [...pop.uf.values()].reduce((s, v) => s + (v ?? 0), 0);
    return Object.entries(REG).map(([name, ufs]) => { const rs = rows.filter(r => ufs.includes(r.uf)), t = rs.reduce((s, r) => s + r.total, 0), fo = rs.reduce((s, r) => s + r.focus, 0), p = ufs.reduce((s, u) => s + (pop.uf.get(u) ?? 0), 0); return { name, total: t, share: all > 0 ? t / all : 0, popShare: popAll > 0 ? p / popAll : null, focusShare: t > 0 ? fo / t : 0 }; }).sort((a, b) => b.total - a.total);
  }, [rows, pop.uf]);
  const strongest = rows ? [...rows].filter(r => r.total >= 300).sort((a, b) => (b.index ?? 0) - (a.index ?? 0))[0] : null;
  const head = (k, t) => <th><button type="button" aria-pressed={sort === k} onClick={() => setSort(k)}>{t}{sort === k ? ' ↓' : ''}</button></th>;

  return (
    <div className="px-page">
      <PageHead title="Territórios" toc={[['t-mapa', 'Mapa dos municípios'], ['t-estados', 'Estados'], ['t-regioes', 'Regiões']]} />
      <Section id="t-mapa" title="Quem lidera em cada município" sub="Arraste para mover, aproxime com Ctrl + rolagem ou pinça e clique num estado para entrar nele. Clique num município para ver o detalhe.">
        <div className="nx-c12 nx-card px-mapcard"><MapaBrasil /></div>
      </Section>
      <Section id="t-estados" title="Estados" sub={strongest ? <>{focusName} é mais forte em {UF_NAMES[strongest.uf]}: {pct(strongest.share, 1)} do mercado do estado, {strongest.index.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}× a sua média no país.</> : null}>
        {!rows ? <div className="nx-c12"><Skel /></div> : (
          <Block className="nx-c12" title="Mercado e marca em foco por estado" sub={'Variações contra ' + (market?.yearRange ? rangeText(market.yearRange) : 'o ano anterior') + ' · clique no título de uma coluna para ordenar'} info="Índice = participação da marca no estado dividida pela participação dela no país. Acima de 1×, a marca é mais forte ali do que na média.">
            <div className="px-table-wrap">
              <table className="px-table">
                <thead><tr><th>Estado</th>{head('total', 'Emplacamentos')}{head('change', 'Var. a/a')}{head('per', 'Por mil hab.')}{head('share', focusName)}{head('dShare', 'Var. p.p.')}{head('index', 'Índice')}</tr></thead>
                <tbody>{rows.map(r => (
                  <tr key={r.uf}>
                    <th><button type="button" className="px-tlink" onClick={() => setFilter('uf', [r.uf])} title={'Filtrar o site por ' + UF_NAMES[r.uf]}>{UF_NAMES[r.uf]}</button></th>
                    <td>{fmt(r.total)}</td><td className={r.change > 0 ? 'up' : r.change < 0 ? 'down' : ''}>{signed(r.change, 1)}</td>
                    <td>{r.per != null ? r.per.toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : '—'}</td>
                    <td className="f">{pct(r.share, 2)}<span className="px-tbar"><span style={{ width: Math.min(100, r.share / Math.max(...rows.map(x => x.share), 1e-9) * 100) + '%' }} /></span></td>
                    <td className={r.dShare > 0 ? 'up' : r.dShare < 0 ? 'down' : ''}>{pp(r.dShare, 2)}</td>
                    <td className={r.index >= 1 ? 'f' : ''}>{r.index != null ? r.index.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + '×' : '—'}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </Block>
        )}
      </Section>
      <Section id="t-regioes" title="Regiões">
        {!regions ? <div className="nx-c12"><Skel h={200} /></div> : (
          <Block className="nx-c12" title="Peso de cada região no mercado e na população" sub={regions[0] ? <>{regions[0].name}: <em>{pct(regions[0].share, 0)}</em> dos emplacamentos{regions[0].popShare != null ? <> e {pct(regions[0].popShare, 0)} dos habitantes</> : ''}</> : null}>
            <div className="px-regions">{regions.map(r => (
              <div key={r.name} className="px-region">
                <span className="px-region-n">{r.name}</span>
                <span className="px-region-bars"><span className="a" style={{ width: r.share * 100 + '%' }} /><span className="b" style={{ width: (r.popShare ?? 0) * 100 + '%' }} /></span>
                <span className="px-region-v"><b>{pct(r.share, 1)}</b><small>{r.popShare != null ? pct(r.popShare, 1) + ' da pop.' : ''}</small></span>
                <span className="px-region-f">{focusName} <b>{pct(r.focusShare, 2)}</b></span>
              </div>))}
              <div className="nx-legend"><span><i style={{ background: 'var(--nx-ink)' }} />Emplacamentos</span><span><i style={{ background: '#c7c7cc' }} />População</span></div>
            </div>
          </Block>
        )}
      </Section>
    </div>
  );
}
