import { useEffect, useMemo, useState } from 'react';
import { downloadCsv } from '../../kit/index.js';
import { Block } from '../base/block.jsx';
import { UfMap } from '../base/geo.jsx';
import { useTip } from '../base/charts.jsx';
import { useAtlas } from '../ctx.js';
import { fmt, pct, monthLabel, UF_NAMES } from '../lib.js';
import { Seg, Skel } from '../ui.jsx';
import './lab-eletropostos.css';

const REGIONS = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];
const METRICS = [['total', 'Todos os pontos'], ['ac', 'AC · lenta'], ['dc', 'DC · rápida']];
const PAGE_SIZE = 12;
const cache = new Map();
const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const sum = rows => rows.reduce((total, row) => ({ ac: total.ac + row.ac, dc: total.dc + row.dc, total: total.total + row.total }), { ac: 0, dc: 0, total: 0 });

function useCharging(base, revision) {
  const url = new URL('charging/abve.json', base).href;
  const [state, setState] = useState(() => ({ data: cache.get(url), error: null }));
  useEffect(() => {
    if (cache.has(url)) { setState({ data: cache.get(url), error: null }); return undefined; }
    const abort = new AbortController();
    setState({ data: null, error: null });
    fetch(url, { signal: abort.signal, credentials: 'same-origin' })
      .then(response => { if (!response.ok) throw Error('A base de recarga está indisponível.'); return response.json(); })
      .then(data => {
        if (data.schemaVersion !== 1 || !Array.isArray(data.places) || !Array.isArray(data.states) || !Array.isArray(data.history) || !data.metadata?.referenceMonth) throw Error('Não foi possível ler a base de recarga.');
        cache.set(url, data); setState({ data, error: null });
      })
      .catch(error => { if (error.name !== 'AbortError') setState({ data: null, error: error.message }); });
    return () => abort.abort();
  }, [url, revision]);
  return state;
}

function ChargingHistory({ history }) {
  const tip = useTip();
  const rows = [...history].sort((a, b) => a.month.localeCompare(b.month));
  if (!rows.length) return <p className="px-scopenote">Histórico indisponível nesta fotografia.</p>;
  const W = 1000, H = 224, pad = { l: 58, r: 38, t: 28, b: 35 };
  const date = month => Date.parse(month + '-01T12:00:00Z');
  const first = date(rows[0].month), last = date(rows.at(-1).month);
  const max = Math.ceil(Math.max(...rows.map(row => row.total)) / 10000) * 10000 || 1;
  const x = row => pad.l + (date(row.month) - first) / Math.max(1, last - first) * (W - pad.l - pad.r);
  const y = n => pad.t + (1 - n / max) * (H - pad.t - pad.b);
  const path = rows.map((row, i) => `${i ? 'L' : 'M'}${x(row)},${y(row.total)}`).join(' ');
  const ticks = [0, max / 2, max];
  const years = [...new Set(rows.map(row => row.month.slice(0, 4)))];
  return <div className="lc-history-chart">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Levantamentos nacionais de pontos de recarga: ${fmt(rows[0].total)} em ${monthLabel(rows[0].month)} e ${fmt(rows.at(-1).total)} em ${monthLabel(rows.at(-1).month)}. Datas irregulares.`} onPointerLeave={tip.hide}>
      {ticks.map(n => <g key={n}><line className="lc-history-grid" x1={pad.l} x2={W - pad.r} y1={y(n)} y2={y(n)} /><text className="lc-history-axis" x={pad.l - 12} y={y(n) + 4} textAnchor="end">{n ? fmt(n / 1000) + ' mil' : '0'}</text></g>)}
      <path className="lc-history-area" d={path + ` L${x(rows.at(-1))},${y(0)} L${x(rows[0])},${y(0)} Z`} />
      <path className="lc-history-line" d={path} />
      {years.map(year => { const row = rows.find(item => item.month.startsWith(year)); return <text key={year} className="lc-history-axis" x={x(row)} y={H - 9} textAnchor="middle">{year}</text>; })}
      {rows.map(row => <g key={row.month} tabIndex={0} role="img" aria-label={`${monthLabel(row.month)}: ${fmt(row.total)} pontos`} onPointerMove={event => tip.show(event, <><strong>{monthLabel(row.month)}</strong><span>{fmt(row.total)} pontos de recarga</span></>)}>
        <circle className="lc-history-hit" cx={x(row)} cy={y(row.total)} r={12} />
        <circle className="lc-history-dot" cx={x(row)} cy={y(row.total)} r={3.6} />
        <title>{monthLabel(row.month)}: {fmt(row.total)} pontos</title>
      </g>)}
      <text className="lc-history-last" x={x(rows.at(-1))} y={y(rows.at(-1).total) - 13} textAnchor="end">{fmt(rows.at(-1).total)}</text>
    </svg>
    {tip.node}
  </div>;
}

export default function Eletropostos() {
  const { base } = useAtlas();
  const [revision, setRevision] = useState(0), { data, error } = useCharging(base, revision);
  const [region, setRegion] = useState('all'), [uf, setUf] = useState('all'), [search, setSearch] = useState('');
  const [metric, setMetric] = useState('total'), [page, setPage] = useState(0), [sort, setSort] = useState('metric'), [allStates, setAllStates] = useState(false);
  const tip = useTip();
  const places = useMemo(() => (data?.places ?? []).filter(row => (region === 'all' || row.region === region) && (uf === 'all' || row.uf === uf) && (!search.trim() || norm(row.name + ' ' + row.uf).includes(norm(search.trim())))), [data, region, uf, search]);
  const totals = useMemo(() => sum(places), [places]);
  const states = useMemo(() => {
    const by = new Map();
    for (const row of places) {
      if (!by.has(row.uf)) by.set(row.uf, { uf: row.uf, name: UF_NAMES[row.uf] ?? row.uf, ac: 0, dc: 0, total: 0 });
      const state = by.get(row.uf); state.ac += row.ac; state.dc += row.dc; state.total += row.total;
    }
    return [...by.values()].sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name, 'pt-BR'));
  }, [places, metric]);
  const stateMap = useMemo(() => new Map(states.map(row => [row.uf, row])), [states]);
  const shownPlaces = useMemo(() => [...places].filter(row => row[metric] > 0).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'pt-BR') || a.uf.localeCompare(b.uf) : sort === 'dcShare' ? b.dc / b.total - a.dc / a.total || b.total - a.total : b[metric] - a[metric] || a.name.localeCompare(b.name, 'pt-BR')), [places, metric, sort]);
  const pages = Math.max(1, Math.ceil(shownPlaces.length / PAGE_SIZE)), currentPage = Math.min(page, pages - 1);
  const shown = shownPlaces.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  useEffect(() => { setPage(0); }, [region, uf, search, metric, sort]);
  const chooseUf = value => {
    const state = data?.states.find(row => row.uf === value);
    if (state && region !== 'all' && state.region !== region) setRegion('all');
    setUf(value === uf ? 'all' : value); tip.hide();
  };
  const reset = () => { setRegion('all'); setUf('all'); setSearch(''); setPage(0); };
  const exportCsv = () => {
    if (!data) return;
    downloadCsv('atlas-eletropostos-' + data.metadata.referenceMonth + (uf !== 'all' ? '-' + uf.toLowerCase() : ''), shownPlaces.map(row => ({ referencia: data.metadata.referenceDate, uf: row.uf, localidade_publicada: row.name, regiao: row.region, pontos_ac: row.ac, pontos_dc: row.dc, pontos_total: row.total, codigo_ibge_conciliado: row.ibgeCode ?? '', nome_ibge_conciliado: row.ibgeName ?? '', correspondencia: row.matchStatus, linhas_originais: row.sourceRowCount, codigos_fonte: row.sourceCodes.join('|'), fonte: data.metadata.source, fonte_url: data.metadata.sourceUrl })));
  };
  if (error) return <div className="nx-c12 lc-error" role="alert"><h3>Não foi possível carregar os eletropostos</h3><p>{error}</p><button type="button" onClick={() => setRevision(value => value + 1)}>Tentar novamente</button></div>;
  if (!data) return <div className="nx-c12" data-testid="charging-loading"><Skel h={620} /></div>;
  const month = monthLabel(data.metadata.referenceMonth), filtered = region !== 'all' || uf !== 'all' || Boolean(search.trim());
  const scope = uf !== 'all' ? UF_NAMES[uf] : region !== 'all' ? region : 'Brasil';
  const metricLabel = metric === 'ac' ? 'pontos AC' : metric === 'dc' ? 'pontos DC' : 'pontos de recarga';
  const exportSource = data.metadata.source + ' · ' + data.metadata.sourceUrl;
  const exportScope = `Recarga pública e semipública · referência ${month} · ${scope} · ${metricLabel}${search.trim() ? ' · busca: ' + search.trim() : ''}`;
  const historyExportScope = `Brasil · levantamentos nacionais de ${monthLabel(data.history[0]?.month)} a ${monthLabel(data.history.at(-1)?.month)} · datas irregulares`;
  const max = Math.max(1, ...states.map(row => row[metric]));
  const stateRows = allStates ? states : states.slice(0, 8);
  const rowsWithPoints = places.filter(row => row[metric] > 0).length;
  const acShare = totals.total ? totals.ac / totals.total : 0, dcShare = totals.total ? totals.dc / totals.total : 0;
  const paint = state => {
    const row = stateMap.get(state), value = row?.[metric] ?? 0;
    return { fill: value ? 'var(--nx-accent)' : '#e9e9ed', opacity: value ? .14 + .86 * Math.sqrt(value / max) : 1, tip: <><strong>{UF_NAMES[state]}</strong><span>{fmt(value)} {metricLabel}</span>{row && <span>AC {fmt(row.ac)} · DC {fmt(row.dc)}</span>}<span>Clique para explorar o estado</span></> };
  };
  return <div className="nx-c12 lc" data-testid="charging-explorer">
    <div className="lc-context"><span><i aria-hidden />ABVE / Tupi Mobilidade</span><span>Fotografia de {month}</span></div>
    <div className="lc-kpis" aria-label={'Pontos de recarga em ' + scope}>
      <div className="lc-kpi lc-kpi-dark"><span>Rede de recarga · {scope}</span><strong data-testid="charging-total">{fmt(totals.total)}</strong><small>pontos públicos e semipúblicos{search.trim() ? ' na busca' : ''}</small><div className="lc-kpi-bolt" aria-hidden>↯</div></div>
      <div className="lc-kpi"><span><i className="lc-dot ac" />Recarga AC</span><strong data-testid="charging-ac">{fmt(totals.ac)}</strong><small>{pct(acShare, 1)} da rede · recarga lenta</small><div className="lc-mini-track"><i style={{ width: acShare * 100 + '%' }} /></div></div>
      <div className="lc-kpi"><span><i className="lc-dot dc" />Recarga DC</span><strong className="lc-red" data-testid="charging-dc">{fmt(totals.dc)}</strong><small>{pct(dcShare, 1)} da rede · recarga rápida</small><div className="lc-mini-track dc"><i style={{ width: dcShare * 100 + '%' }} /></div></div>
      <div className="lc-kpi lc-kpi-coverage"><span>Alcance territorial</span><strong>{states.length}<em> UFs</em></strong><small>{fmt(places.length)} nomes geográficos publicados</small><span className="lc-coverage-note">Inclui municípios e distritos</span></div>
    </div>
    <div className="lc-controls">
      <div className="lc-controls-top"><span className="lc-control-label">Explorar a rede</span><Seg label="Pontos exibidos no mapa e ranking" value={metric} onChange={setMetric} options={METRICS} /><button className="lc-export" type="button" onClick={exportCsv} disabled={!shownPlaces.length}><svg viewBox="0 0 16 16" aria-hidden><path d="M8 2v8m-3-3 3 3 3-3M3 12v2h10v-2" /></svg>Baixar CSV</button></div>
      <div className="lc-controls-bottom">
        <label>Região<select aria-label="Região dos eletropostos" value={region} onChange={event => { setRegion(event.target.value); setUf('all'); }}><option value="all">Todas as regiões</option>{REGIONS.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Estado<select aria-label="Estado dos eletropostos" value={uf} onChange={event => setUf(event.target.value)}><option value="all">Todos os estados</option>{data.states.filter(row => region === 'all' || row.region === region).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(row => <option key={row.uf} value={row.uf}>{row.name}</option>)}</select></label>
        <label className="lc-search">Município ou distrito<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar uma localidade…" aria-label="Buscar município ou distrito nos eletropostos" /></label>
        {filtered && <button type="button" className="lc-reset" onClick={reset}>Limpar filtros</button>}
      </div>
      <p className="lc-scope-note">Base de recarga com fotografia e filtros próprios. Período, marca e demais filtros de veículos do topo não alteram estes dados.</p>
    </div>
    <div className="lc-geography">
      <Block title="Onde está a rede" sub={`${scope} · ${metricLabel} · ${month}`} info="Contagens por estado. A cor fica mais intensa onde há mais pontos; clique no mapa ou selecione um estado. São agregados territoriais, não coordenadas de estações individuais." className="lc-map-card" exportScope={exportScope} exportSource={exportSource}>
        <div className="lc-map"><UfMap paint={paint} selected={uf === 'all' ? [] : [uf]} onPick={chooseUf} tip={tip} label={'Pontos de recarga por estado, ' + metricLabel} /></div>
        <div className="lc-scale"><span>Menos pontos</span><i aria-hidden /><span>Mais pontos</span></div>
        <p className="lc-map-hint">Clique em um estado para ver as localidades.</p>
      </Block>
      <Block title="Estados com mais pontos" sub={`${fmt(totals[metric])} ${metricLabel} no recorte`} info="Ranking em ordem decrescente da medida selecionada. Em Todos os pontos, a barra separa AC (preto) e DC (vermelho). Os valores respeitam região, estado e busca." className="lc-rank-card" exportScope={exportScope} exportSource={exportSource}>
        <div className="lc-rank-legend"><span><i className="lc-dot ac" />AC · lenta</span><span><i className="lc-dot dc" />DC · rápida</span></div>
        {!states.length ? <p className="lc-empty">Nenhuma localidade encontrada. Tente outra busca.</p> : <div className="lc-rank">{stateRows.map((row, index) => <button key={row.uf} type="button" className={'lc-rank-row' + (uf === row.uf ? ' on' : '')} onClick={() => chooseUf(row.uf)} aria-label={`${row.name}, ${fmt(row[metric])} ${metricLabel}. ${uf === row.uf ? 'Remover seleção' : 'Selecionar estado'}`}><span className="lc-rank-name"><small>{index + 1}</small><b>{row.uf}</b><span>{row.name}</span></span><span className="lc-rank-track"><i style={{ width: row[metric] / max * 100 + '%' }}>{metric === 'total' ? <><span className="ac" style={{ flex: row.ac }} /><span className="dc" style={{ flex: row.dc }} /></> : <span className={metric} />}</i></span><strong>{fmt(row[metric])}</strong></button>)}</div>}
        {states.length > 8 && <button className="lc-more" type="button" onClick={() => setAllStates(value => !value)}>{allStates ? 'Mostrar os 8 primeiros' : `Ver os ${states.length} estados`}<span aria-hidden>{allStates ? '−' : '+'}</span></button>}
      </Block>
    </div>
    <Block title="Municípios e distritos" sub={`${fmt(rowsWithPoints)} localidades com ${metricLabel}${filtered ? ' no recorte' : ' na base'}`} info="Cada linha agrupa exatamente o nome e a UF publicados pela fonte. Alguns nomes são distritos ou regiões administrativas. Códigos de origem não são presumidos como códigos IBGE. A tabela mantém os pontos sem correspondência municipal segura." className="lc-table-card" exportScope={exportScope} exportSource={exportSource}
      actions={<label className="lc-sort">Ordenar por<select aria-label="Ordenar localidades dos eletropostos" value={sort} onChange={event => setSort(event.target.value)}><option value="metric">Mais {metricLabel}</option><option value="name">Nome da localidade</option><option value="dcShare">Maior participação DC</option></select></label>}>
      <div className="px-table-wrap"><table className="lc-table"><thead><tr><th scope="col">Localidade publicada</th><th scope="col">UF</th><th scope="col">AC · lenta</th><th scope="col">DC · rápida</th><th scope="col">Total</th><th scope="col">Participação DC</th></tr></thead><tbody>{shown.map(row => <tr key={row.id}><th scope="row">{row.name}{row.matchStatus === 'unmatched' && <small title="Nome ainda sem correspondência segura com o catálogo municipal do Atlas">A conciliar</small>}</th><td>{row.uf}</td><td className={metric === 'ac' ? 'lc-selected-cell' : ''}>{fmt(row.ac)}</td><td className={metric === 'dc' ? 'lc-selected-cell' : ''}>{fmt(row.dc)}</td><td className={metric === 'total' ? 'lc-selected-cell' : ''}>{fmt(row.total)}</td><td><span className="lc-dcshare"><i style={{ width: row.dc / row.total * 100 + '%' }} /><b>{pct(row.dc / row.total, 0)}</b></span></td></tr>)}</tbody></table></div>
      {!shown.length && <p className="lc-empty">Nenhuma localidade com {metricLabel} neste recorte.</p>}
      <div className="lc-table-footer"><span>{shown.length ? `${fmt(currentPage * PAGE_SIZE + 1)}–${fmt(currentPage * PAGE_SIZE + shown.length)} de ${fmt(shownPlaces.length)} localidades` : '0 localidades'} · CSV exporta todas as linhas do recorte</span><div><button type="button" disabled={currentPage === 0} onClick={() => setPage(value => Math.max(0, value - 1))} aria-label="Página anterior de eletropostos">←</button><span>{currentPage + 1} / {pages}</span><button type="button" disabled={currentPage >= pages - 1} onClick={() => setPage(value => Math.min(pages - 1, value + 1))} aria-label="Próxima página de eletropostos">→</button></div></div>
    </Block>
    <Block title="Como a rede cresceu" sub={`Brasil · ${data.history.length} levantamentos, de ${monthLabel(data.history[0]?.month)} a ${monthLabel(data.history.at(-1)?.month)}`} info="Cada ponto é uma fotografia nacional publicada pela ABVE/Tupi. Os intervalos entre levantamentos são irregulares; não há observações mensais completas nem histórico municipal nesta fonte. Esta série nacional permanece a mesma ao filtrar localidades." className="lc-history-card" exportScope={historyExportScope} exportSource={exportSource}>
      <ChargingHistory history={data.history} />
      <p className="lc-scope-note">Fotografias nacionais em datas irregulares. A linha conecta os levantamentos disponíveis; não representa medições nos intervalos.</p>
    </Block>
    <div className="lc-source"><p><a href={data.metadata.sourceUrl} target="_blank" rel="noreferrer">Fonte: {data.metadata.source} ↗</a> · referência exibida: {month}. AC = corrente alternada; DC = corrente contínua.</p><details><summary>Sobre a base e as correspondências geográficas</summary><p>A fonte reúne pontos públicos e semipúblicos, agregados por localidade. Os {fmt(data.totals.geographicLabels)} nomes publicados incluem distritos e regiões administrativas e não equivalem a uma contagem validada de municípios IBGE. As observações repetidas são preservadas na origem e somadas por nome exato e UF.</p><p>{fmt(data.totals.unmatchedPoints)} pontos em registros ainda sem correspondência municipal segura permanecem nos totais. Não há endereço, operador, conector ou coordenadas individuais dos postos nesta base.</p><p>{data.metadata.periodCaveat} A referência publicada foi mantida. As condições de reutilização devem ser verificadas com ABVE/Tupi antes de redistribuir a base.</p></details></div>
    {tip.node}
  </div>;
}
